import { Bucket } from "@aws-cdk/aws-s3";
import {
    AllowedMethods,
    CacheHeaderBehavior,
    CachePolicy,
    Distribution,
    FunctionEventType,
    HttpVersion,
    OriginAccessIdentity,
    OriginProtocolPolicy,
    OriginRequestCookieBehavior,
    OriginRequestHeaderBehavior,
    OriginRequestPolicy,
    OriginRequestQueryStringBehavior,
    ViewerProtocolPolicy,
} from "@aws-cdk/aws-cloudfront";
import { CfnOutput, Construct, Duration, Fn, RemovalPolicy } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import chalk from "chalk";
import { HttpOrigin, S3Origin } from "@aws-cdk/aws-cloudfront-origins";
import * as acm from "@aws-cdk/aws-certificatemanager";
import { BehaviorOptions, ErrorResponse } from "@aws-cdk/aws-cloudfront/lib/distribution";
import * as path from "path";
import * as fs from "fs";
import { flatten } from "lodash";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import { log } from "../utils/logger";
import { s3Put, s3Sync } from "../utils/s3-sync";
import { emptyBucket, invalidateCloudFrontCache } from "../classes/aws";
import { AwsConstruct, AwsProvider } from "../classes";
import { ConstructCommands } from "../classes/Construct";
import ServerlessError from "../utils/error";

const SCHEMA = {
    type: "object",
    properties: {
        type: { const: "server-side-website" },
        apiGateway: { enum: ["http", "rest"] },
        assets: {
            type: "object",
            additionalProperties: { type: "string" },
            propertyNames: {
                pattern: "^/.*$",
            },
            minProperties: 1,
        },
        errorPage: { type: "string" },
        domain: {
            anyOf: [
                { type: "string" },
                {
                    type: "array",
                    items: { type: "string" },
                },
            ],
        },
        certificate: { type: "string" },
        forwardedHeaders: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
} as const;

type Configuration = FromSchema<typeof SCHEMA>;

export class ServerSideWebsite extends AwsConstruct {
    public static type = "server-side-website";
    public static schema = SCHEMA;
    public static commands: ConstructCommands = {
        "assets:upload": {
            usage: "Upload assets directly to S3 without going through a CloudFormation deployment.",
            handler: ServerSideWebsite.prototype.uploadAssets,
        },
    };

    private readonly distribution: Distribution;
    private readonly bucketNameOutput: CfnOutput;
    private readonly domainOutput: CfnOutput;
    private readonly cnameOutput: CfnOutput;
    private readonly distributionIdOutput: CfnOutput;

    constructor(
        scope: Construct,
        private readonly id: string,
        readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);

        if (configuration.domain !== undefined && configuration.certificate === undefined) {
            throw new Error(
                `Invalid configuration in 'constructs.${id}.certificate': if a domain is configured, then a certificate ARN must be configured as well.`
            );
        }
        if (configuration.errorPage !== undefined && !configuration.errorPage.endsWith(".html")) {
            throw new Error(
                `Invalid configuration in 'constructs.${id}.errorPage': the custom error page must be a static HTML file. '${configuration.errorPage}' does not end with '.html'.`
            );
        }

        const bucket = new Bucket(this, "Assets", {
            // Assets are compiled artifacts, we can clear them on serverless remove
            removalPolicy: RemovalPolicy.DESTROY,
        });
        const cloudFrontOAI = new OriginAccessIdentity(this, "OriginAccessIdentity", {
            comment: `Identity that represents CloudFront for the ${id} website.`,
        });
        bucket.grantRead(cloudFrontOAI);

        /**
         * We create custom "Origin Policy" and "Cache Policy" for the backend.
         * "All URL query strings, HTTP headers, and cookies that you include in the cache key (using a cache policy) are automatically included in origin requests. Use the origin request policy to specify the information that you want to include in origin requests, but not include in the cache key."
         * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html
         */
        const backendOriginPolicy = new OriginRequestPolicy(this, "BackendOriginPolicy", {
            originRequestPolicyName: `${this.provider.stackName}-${id}`,
            comment: `Origin request policy for the ${id} website.`,
            cookieBehavior: OriginRequestCookieBehavior.all(),
            queryStringBehavior: OriginRequestQueryStringBehavior.all(),
            headerBehavior: this.headersToForward(),
        });
        const backendCachePolicy = new CachePolicy(this, "BackendCachePolicy", {
            cachePolicyName: `${this.provider.stackName}-${id}`,
            comment: `Cache policy for the ${id} website.`,
            // For the backend we disable all caching by default
            defaultTtl: Duration.seconds(0),
            // Authorization is an exception and must be whitelisted in the Cache Policy
            // This is the reason why we don't use the managed `CachePolicy.CACHING_DISABLED`
            headerBehavior: CacheHeaderBehavior.allowList("Authorization"),
        });
        const s3Origin = new S3Origin(bucket, {
            originAccessIdentity: cloudFrontOAI,
        });

        const apiId =
            configuration.apiGateway === "rest"
                ? this.provider.naming.getRestApiLogicalId()
                : this.provider.naming.getHttpApiLogicalId();
        const apiGatewayDomain = Fn.join(".", [Fn.ref(apiId), `execute-api.${this.provider.region}.amazonaws.com`]);

        // Cast the domains to an array
        const domains = configuration.domain !== undefined ? flatten([configuration.domain]) : undefined;
        const certificate =
            configuration.certificate !== undefined
                ? acm.Certificate.fromCertificateArn(this, "Certificate", configuration.certificate)
                : undefined;

        this.distribution = new Distribution(this, "CDN", {
            comment: `${provider.stackName} ${id} website CDN`,
            defaultBehavior: {
                // Origins are where CloudFront fetches content
                origin: new HttpOrigin(apiGatewayDomain, {
                    // API Gateway only supports HTTPS
                    protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
                }),
                // For a backend app we all all methods
                allowedMethods: AllowedMethods.ALLOW_ALL,
                cachePolicy: backendCachePolicy,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                // Forward all values (query strings, headers, and cookies) to the backend app
                // See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policies-list
                originRequestPolicy: backendOriginPolicy,
                functionAssociations: [
                    {
                        function: this.createRequestFunction(),
                        eventType: FunctionEventType.VIEWER_REQUEST,
                    },
                ],
            },
            // All the assets paths are created in there
            additionalBehaviors: this.createCacheBehaviors(s3Origin),
            errorResponses: this.createErrorResponses(),
            // Enable http2 transfer for better performances
            httpVersion: HttpVersion.HTTP2,
            certificate: certificate,
            domainNames: domains,
        });

        // CloudFormation outputs
        this.bucketNameOutput = new CfnOutput(this, "AssetsBucketName", {
            description: "Name of the bucket that stores the website assets.",
            value: bucket.bucketName,
        });
        let websiteDomain = this.getMainCustomDomain();
        if (websiteDomain === undefined) {
            // Fallback on the CloudFront domain
            websiteDomain = this.distribution.distributionDomainName;
        }
        this.domainOutput = new CfnOutput(this, "Domain", {
            description: "Website domain name.",
            value: websiteDomain,
        });
        this.cnameOutput = new CfnOutput(this, "CloudFrontCName", {
            description: "CloudFront CNAME.",
            value: this.distribution.distributionDomainName,
        });
        this.distributionIdOutput = new CfnOutput(this, "DistributionId", {
            description: "ID of the CloudFront distribution.",
            value: this.distribution.distributionId,
        });
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            url: () => this.getUrl(),
            cname: () => this.getCName(),
        };
    }

    references(): Record<string, Record<string, unknown>> {
        return {
            url: this.referenceUrl(),
        };
    }

    async postDeploy(): Promise<void> {
        await this.uploadAssets();
    }

    async uploadAssets(): Promise<void> {
        log(`Deploying the assets for the '${this.id}' website`);

        const bucketName = await this.getBucketName();
        if (bucketName === undefined) {
            throw new Error(
                `Could not find the bucket in which to deploy the '${this.id}' website: did you forget to run 'serverless deploy' first?`
            );
        }

        let invalidate = false;
        for (const [pattern, filePath] of Object.entries(this.getAssetPatterns())) {
            if (!fs.existsSync(filePath)) {
                throw new Error(`Error in 'constructs.${this.id}': the file or directory '${filePath}' does not exist`);
            }
            let s3PathPrefix: string = path.dirname(pattern);
            if (s3PathPrefix.startsWith("/")) {
                s3PathPrefix = s3PathPrefix.slice(1);
            }

            if (fs.lstatSync(filePath).isDirectory()) {
                // Directory
                log(`Uploading '${filePath}' to 's3://${bucketName}/${s3PathPrefix}'`);
                const { hasChanges } = await s3Sync({
                    aws: this.provider,
                    localPath: filePath,
                    targetPathPrefix: s3PathPrefix,
                    bucketName,
                });
                invalidate = invalidate || hasChanges;
            } else {
                // File
                const targetKey = path.join(s3PathPrefix, path.basename(filePath));
                log(`Uploading '${filePath}' to 's3://${bucketName}/${targetKey}'`);
                await s3Put(this.provider, bucketName, targetKey, fs.readFileSync(filePath));
                invalidate = true;
            }
        }
        if (invalidate) {
            await this.clearCDNCache();
        }

        const domain = await this.getDomain();
        if (domain !== undefined) {
            log(`Deployed ${chalk.green(`https://${domain}`)}`);
        }
    }

    private async clearCDNCache(): Promise<void> {
        const distributionId = await this.getDistributionId();
        if (distributionId === undefined) {
            return;
        }
        await invalidateCloudFrontCache(this.provider, distributionId);
    }

    async preRemove(): Promise<void> {
        const bucketName = await this.getBucketName();
        if (bucketName === undefined) {
            // No bucket found => nothing to delete!
            return;
        }

        log(
            `Emptying S3 bucket '${bucketName}' for the '${this.id}' website, else CloudFormation will fail (it cannot delete a non-empty bucket)`
        );
        await emptyBucket(this.provider, bucketName);
    }

    referenceUrl(): Record<string, unknown> {
        let domain = this.getMainCustomDomain();
        if (domain === undefined) {
            domain = this.distribution.distributionDomainName;
        }

        return this.provider.getCloudFormationReference(Fn.join("", ["https://", domain]));
    }

    async getUrl(): Promise<string | undefined> {
        const domain = await this.getDomain();
        if (domain === undefined) {
            return undefined;
        }

        return `https://${domain}`;
    }

    async getBucketName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.bucketNameOutput);
    }

    async getDomain(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.domainOutput);
    }

    async getCName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.cnameOutput);
    }

    async getDistributionId(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.distributionIdOutput);
    }

    getMainCustomDomain(): string | undefined {
        if (this.configuration.domain === undefined) {
            return undefined;
        }

        // In case of multiple domains, we take the first one
        return typeof this.configuration.domain === "string" ? this.configuration.domain : this.configuration.domain[0];
    }

    private headersToForward(): OriginRequestHeaderBehavior {
        let additionalHeadersToForward = this.configuration.forwardedHeaders ?? [];
        if (additionalHeadersToForward.includes("Host")) {
            throw new ServerlessError(
                `Invalid value in 'constructs.${this.id}.forwardedHeaders': the 'Host' header cannot be forwarded (this is an API Gateway limitation). Use the 'X-Forwarded-Host' header in your code instead (it contains the value of the original 'Host' header).`,
                "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
            );
        }
        if (additionalHeadersToForward.includes("Authorization")) {
            // `Authorization` cannot be forwarded via this setting (we automatically forward it anyway so we remove it from the list)
            additionalHeadersToForward = additionalHeadersToForward.filter(
                (header: string) => header !== "Authorization"
            );
        }

        /**
         * We forward everything except:
         * - `Host` because it messes up API Gateway (that uses the Host to identify which API Gateway to invoke)
         * - `Authorization` because it must be configured on the cache policy
         *   (see https://aws.amazon.com/premiumsupport/knowledge-center/cloudfront-authorization-header/?nc1=h_ls)
         */
        return OriginRequestHeaderBehavior.allowList(
            "Accept",
            "Accept-Language",
            "Origin",
            "Referer",
            // This header is set by our CloudFront Function
            "X-Forwarded-Host",
            // We merge the user-provided list in the hardcoded list
            ...additionalHeadersToForward
        );
    }

    private createCacheBehaviors(s3Origin: S3Origin): Record<string, BehaviorOptions> {
        const behaviors: Record<string, BehaviorOptions> = {};
        for (const pattern of Object.keys(this.getAssetPatterns())) {
            behaviors[pattern] = {
                // Origins are where CloudFront fetches content
                origin: s3Origin,
                allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                // Use the "Managed-CachingOptimized" policy
                // See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policies-list
                cachePolicy: CachePolicy.CACHING_OPTIMIZED,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            };
        }

        return behaviors;
    }

    private createRequestFunction(): cloudfront.Function {
        /**
         * CloudFront function that forwards the real `Host` header into `X-Forwarded-Host`
         *
         * CloudFront does not forward the original `Host` header. We use this
         * to forward the website domain name to the backend app via the `X-Forwarded-Host` header.
         * Learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host
         */
        const code = `function handler(event) {
    var request = event.request;
    request.headers["x-forwarded-host"] = request.headers["host"];
    return request;
}`;

        return new cloudfront.Function(this, "RequestFunction", {
            functionName: `${this.provider.stackName}-${this.provider.region}-${this.id}-request`,
            code: cloudfront.FunctionCode.fromInline(code),
        });
    }

    private createErrorResponses(): ErrorResponse[] {
        let responsePagePath = undefined;
        if (this.configuration.errorPage !== undefined) {
            responsePagePath = `/${this.getErrorPageFileName()}`;
        }

        return [
            {
                httpStatus: 500,
                // Disable caching of error responses
                ttl: Duration.seconds(0),
                responsePagePath,
            },
            {
                httpStatus: 504,
                // Disable caching of error responses
                ttl: Duration.seconds(0),
                responsePagePath,
            },
        ];
    }

    private getAssetPatterns(): Record<string, string> {
        const assetPatterns = this.configuration.assets ?? {};
        // If a custom error page is provided, we upload it to S3
        if (this.configuration.errorPage !== undefined) {
            assetPatterns[`/${this.getErrorPageFileName()}`] = this.configuration.errorPage;
        }

        return assetPatterns;
    }

    private getErrorPageFileName(): string {
        return this.configuration.errorPage !== undefined ? path.basename(this.configuration.errorPage) : "";
    }
}
