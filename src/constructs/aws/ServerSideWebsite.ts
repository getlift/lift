import type { CfnBucket } from "aws-cdk-lib/aws-s3";
import { Bucket } from "aws-cdk-lib/aws-s3";
import type { CfnDistribution, IOriginRequestPolicy } from "aws-cdk-lib/aws-cloudfront";
import {
    AllowedMethods,
    CachePolicy,
    Distribution,
    FunctionEventType,
    HttpVersion,
    OriginProtocolPolicy,
    ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import type { Construct } from "constructs";
import type { CfnResource } from "aws-cdk-lib";
import { CfnOutput, Duration, Fn, RemovalPolicy } from "aws-cdk-lib";
import type { FromSchema } from "json-schema-to-ts";
import { HttpOrigin, S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import type { BehaviorOptions, ErrorResponse } from "aws-cdk-lib/aws-cloudfront/lib/distribution";
import * as path from "path";
import * as fs from "fs";
import { flatten } from "lodash";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { AwsConstruct } from "@lift/constructs/abstracts";
import type { ConstructCommands } from "@lift/constructs";
import type { AwsProvider } from "@lift/providers";
import { ensureNameMaxLength } from "../../utils/naming";
import { s3Put, s3Sync } from "../../utils/s3-sync";
import { emptyBucket, invalidateCloudFrontCache } from "../../classes/aws";
import ServerlessError from "../../utils/error";
import { redirectToMainDomain } from "../../classes/cloudfrontFunctions";
import type { Progress } from "../../utils/logger";
import { getUtils } from "../../utils/logger";

const SCHEMA = {
    type: "object",
    properties: {
        type: { const: "server-side-website" },
        apiGateway: { enum: ["http", "rest"] },
        originName: { type: "string" },
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
        redirectToMainDomain: { type: "boolean" },
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
            handler: ServerSideWebsite.prototype.uploadAssetsCommand,
        },
    };

    private readonly distribution: Distribution;
    private readonly bucket: Bucket;
    private readonly domains: string[] | undefined;
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
            throw new ServerlessError(
                `Invalid configuration in 'constructs.${id}.certificate': if a domain is configured, then a certificate ARN must be configured as well.`,
                "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
            );
        }
        if (configuration.errorPage !== undefined && !configuration.errorPage.endsWith(".html")) {
            throw new ServerlessError(
                `Invalid configuration in 'constructs.${id}.errorPage': the custom error page must be a static HTML file. '${configuration.errorPage}' does not end with '.html'.`,
                "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
            );
        }

        this.bucket = new Bucket(this, "Assets", {
            // Assets are compiled artifacts, we can clear them on serverless remove
            removalPolicy: RemovalPolicy.DESTROY,
        });

        // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policy-all-viewer-except-host-header
        // It is not supported by the AWS CDK yet
        const backendOriginPolicy = new (class implements IOriginRequestPolicy {
            public readonly originRequestPolicyId = "b689b0a8-53d0-40ab-baf2-68738e2966ac";
        })();
        const backendCachePolicy = CachePolicy.CACHING_DISABLED;

        // Cast the domains to an array
        this.domains = configuration.domain !== undefined ? flatten([configuration.domain]) : undefined;
        const certificate =
            configuration.certificate !== undefined
                ? acm.Certificate.fromCertificateArn(this, "Certificate", configuration.certificate)
                : undefined;

        // Hide the stage in the URL in REST scenario
        const originPath = configuration.apiGateway === "rest" ? "/" + (provider.getStage() ?? "") : undefined;

        this.distribution = new Distribution(this, "CDN", {
            comment: `${provider.stackName} ${id} website CDN`,
            defaultBehavior: {
                // Origins are where CloudFront fetches content
                origin: new HttpOrigin(this.getCloudFrontOrigin(), {
                    // API Gateway only supports HTTPS
                    protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
                    originPath,
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
            additionalBehaviors: this.createCacheBehaviors(this.bucket),
            errorResponses: this.createErrorResponses(),
            // Enable http2 & http3 transfer for better performances
            httpVersion: HttpVersion.HTTP2_AND_3,
            certificate: certificate,
            domainNames: this.domains,
        });

        // CloudFormation outputs
        this.bucketNameOutput = new CfnOutput(this, "AssetsBucketName", {
            description: "Name of the bucket that stores the website assets.",
            value: this.bucket.bucketName,
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

    variables(): Record<string, unknown> {
        const domain = this.getMainCustomDomain() ?? this.distribution.distributionDomainName;

        return {
            url: Fn.join("", ["https://", domain]),
            cname: this.distribution.distributionDomainName,
            assetsBucketName: this.bucket.bucketName,
        };
    }

    extend(): Record<string, CfnResource> {
        return {
            distribution: this.distribution.node.defaultChild as CfnDistribution,
            bucket: this.bucket.node.defaultChild as CfnBucket,
        };
    }

    async postDeploy(): Promise<void> {
        await this.uploadAssets();
    }

    async uploadAssetsCommand(): Promise<void> {
        getUtils().log(`Deploying the assets for the '${this.id}' website`);

        await this.uploadAssets();

        const domain = await this.getDomain();
        if (domain !== undefined) {
            getUtils().log();
            getUtils().log.success(`Deployed https://${domain}`);
        }
    }

    async uploadAssets(): Promise<void> {
        const bucketName = await this.getBucketName();
        if (bucketName === undefined) {
            throw new ServerlessError(
                `Could not find the bucket in which to deploy the '${this.id}' website: did you forget to run 'serverless deploy' first?`,
                "LIFT_MISSING_STACK_OUTPUT"
            );
        }

        const progress = getUtils().progress;
        let uploadProgress: Progress | undefined;
        if (progress) {
            uploadProgress = progress.create({
                message: "Uploading assets",
            });
        }

        let invalidate = false;
        for (const [pattern, filePath] of Object.entries(this.getAssetPatterns())) {
            if (!fs.existsSync(filePath)) {
                throw new ServerlessError(
                    `Error in 'constructs.${this.id}': the file or directory '${filePath}' does not exist`,
                    "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
                );
            }
            let s3PathPrefix: string = path.dirname(pattern);
            if (s3PathPrefix.startsWith("/")) {
                s3PathPrefix = s3PathPrefix.slice(1);
            }

            if (fs.lstatSync(filePath).isDirectory()) {
                // Directory
                if (uploadProgress) {
                    uploadProgress.update(`Uploading '${filePath}' to 's3://${bucketName}/${s3PathPrefix}'`);
                } else {
                    getUtils().log(`Uploading '${filePath}' to 's3://${bucketName}/${s3PathPrefix}'`);
                }
                const { hasChanges } = await s3Sync({
                    aws: this.provider,
                    localPath: filePath,
                    targetPathPrefix: s3PathPrefix,
                    bucketName,
                });
                invalidate = invalidate || hasChanges;
            } else {
                // File
                const targetKey = path.posix.join(s3PathPrefix, path.basename(filePath));
                if (uploadProgress) {
                    uploadProgress.update(`Uploading '${filePath}' to 's3://${bucketName}/${targetKey}'`);
                } else {
                    getUtils().log(`Uploading '${filePath}' to 's3://${bucketName}/${targetKey}'`);
                }
                await s3Put(this.provider, bucketName, targetKey, fs.readFileSync(filePath));
                invalidate = true;
            }
        }
        if (invalidate) {
            if (uploadProgress) {
                uploadProgress.update(`Clearing CloudFront DNS cache`);
            } else {
                getUtils().log(`Clearing CloudFront DNS cache`);
            }
            await this.clearCDNCache();
        }

        if (uploadProgress) {
            uploadProgress.remove();
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

        getUtils().log(
            `Emptying S3 bucket '${bucketName}' for the '${this.id}' website, else CloudFormation will fail (it cannot delete a non-empty bucket)`
        );
        await emptyBucket(this.provider, bucketName);
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

    private createCacheBehaviors(bucket: Bucket): Record<string, BehaviorOptions> {
        const behaviors: Record<string, BehaviorOptions> = {};
        for (const pattern of Object.keys(this.getAssetPatterns())) {
            if (pattern === "/" || pattern === "/*") {
                throw new ServerlessError(
                    `Invalid key in 'constructs.${this.id}.assets': '/' and '/*' cannot be routed to assets because the root URL already serves the backend application running in Lambda. You must use a sub-path instead, for example '/assets/*'.`,
                    "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
                );
            }
            behaviors[pattern] = {
                // Origins are where CloudFront fetches content
                origin: new S3Origin(bucket),
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
        let additionalCode = "";

        if (this.configuration.redirectToMainDomain === true) {
            additionalCode += redirectToMainDomain(this.domains);
        }

        /**
         * CloudFront function that forwards the real `Host` header into `X-Forwarded-Host`
         *
         * CloudFront does not forward the original `Host` header. We use this
         * to forward the website domain name to the backend app via the `X-Forwarded-Host` header.
         * Learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host
         */
        const code = `function handler(event) {
    var request = event.request;
    request.headers["x-forwarded-host"] = request.headers["host"];${additionalCode}
    return request;
}`;

        const functionName = ensureNameMaxLength(
            `${this.provider.stackName}-${this.provider.region}-${this.id}-request`,
            64
        );

        return new cloudfront.Function(this, "RequestFunction", {
            functionName,
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

    private getCloudFrontOrigin(): string {
        const functions = this.provider.getWebLambdaFunctions();
        const functionsUsingLambdaUrl = functions.reduce((count, func) => count + (func.usesLambdaUrl ? 1 : 0), 0);

        // Fail if no web functions defined
        if (functions.length === 0) {
            throw new ServerlessError(
                "Error trying to detect CloudFront origin. Please check that at least one Lambda function uses 'url', 'events.httpApi', 'events.http' or 'events.alb'.",
                "LIFT_INVALID_STACK_CONFIGURATION"
            );
        }

        // Try to use ApiGateway if one or more functions are defined and none uses Lambda URL
        if (functions.length >= 1 && functionsUsingLambdaUrl === 0) {
            return this.getApiGatewayUrl();
        }

        // Try to use Lambda URL if only one web function is defined
        if (functions.length === 1 && functionsUsingLambdaUrl === 1) {
            return this.getLambdaUrl(functions[0].name);
        }

        // Try to use configured origin
        if (this.configuration.originName !== undefined) {
            const selectedWebFunction = functions.find((f) => f.name === this.configuration.originName);
            if (selectedWebFunction) {
                return selectedWebFunction.usesLambdaUrl
                    ? this.getLambdaUrl(selectedWebFunction.name)
                    : this.getApiGatewayUrl();
            }
        }

        throw new ServerlessError(
            `Error trying to detect CloudFront origin. Invalid or missing 'constructs.${this.id}.originName' key.`,
            "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
        );
    }

    private getApiGatewayUrl() {
        const apiId =
            this.configuration.apiGateway === "rest"
                ? this.provider.naming.getRestApiLogicalId()
                : this.provider.naming.getHttpApiLogicalId();

        return Fn.join(".", [Fn.ref(apiId), `execute-api.${this.provider.region}.amazonaws.com`]);
    }

    private getLambdaUrl(name: string) {
        const lambdaUrlId = this.provider.naming.getLambdaFunctionUrlLogicalId(name);

        return Fn.select(2, Fn.split("/", Fn.getAtt(lambdaUrlId, "FunctionUrl").toString()));
    }
}
