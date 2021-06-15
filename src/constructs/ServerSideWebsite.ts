import { Bucket } from "@aws-cdk/aws-s3";
import {
    AllowedMethods,
    CacheHeaderBehavior,
    CachePolicy,
    Distribution,
    HttpVersion,
    OriginAccessIdentity,
    OriginProtocolPolicy,
    OriginRequestCookieBehavior,
    OriginRequestHeaderBehavior,
    OriginRequestPolicy,
    OriginRequestQueryStringBehavior,
    ViewerProtocolPolicy,
} from "@aws-cdk/aws-cloudfront";
import { Construct as CdkConstruct, CfnOutput, Duration, Fn, RemovalPolicy } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import chalk from "chalk";
import { HttpOrigin, S3Origin } from "@aws-cdk/aws-cloudfront-origins";
import * as acm from "@aws-cdk/aws-certificatemanager";
import { log } from "../utils/logger";
import { s3Sync } from "../utils/s3-sync";
import AwsProvider from "../classes/AwsProvider";
import Construct from "../classes/Construct";
import { emptyBucket, invalidateCloudFrontCache } from "../classes/aws";

export const SERVER_SIDE_WEBSITE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "server-side-website" },
        assetsPath: { type: "string" },
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
    },
    additionalProperties: false,
    required: ["assetsPath"],
} as const;

type Configuration = FromSchema<typeof SERVER_SIDE_WEBSITE_DEFINITION>;

export class ServerSideWebsite extends CdkConstruct implements Construct {
    private readonly distribution: Distribution;
    private readonly bucketNameOutput: CfnOutput;
    private readonly domainOutput: CfnOutput;
    private readonly cnameOutput: CfnOutput;
    private readonly distributionIdOutput: CfnOutput;

    constructor(
        scope: CdkConstruct,
        private readonly id: string,
        readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);

        if (configuration.domain !== undefined && configuration.certificate === undefined) {
            throw new Error(
                `Invalid configuration for the website '${id}': if a domain is configured, then a certificate ARN must be configured as well.`
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
            /**
             * We forward everything except:
             * - `Host` because it messes up API Gateway (that uses the Host to identify which API Gateway to invoke)
             * - `Authorization` because it must be configured on the cache policy
             *   (see https://aws.amazon.com/premiumsupport/knowledge-center/cloudfront-authorization-header/?nc1=h_ls)
             */
            headerBehavior: OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language", "Origin", "Referer"),
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

        // TODO support REST API
        const apiId = this.provider.naming.getHttpApiLogicalId();
        const apiGatewayDomain = Fn.join(".", [Fn.ref(apiId), `execute-api.${this.provider.region}.amazonaws.com`]);

        // Cast the domains to an array
        const domains = configuration.domain !== undefined ? [configuration.domain].flat() : undefined;
        const certificate =
            configuration.certificate !== undefined
                ? acm.Certificate.fromCertificateArn(this, "Certificate", configuration.certificate)
                : undefined;
        // TODO use CloudFront functions to forward the real host header?
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
            },
            additionalBehaviors: {
                "assets/*": {
                    // Origins are where CloudFront fetches content
                    origin: new S3Origin(bucket, {
                        originAccessIdentity: cloudFrontOAI,
                    }),
                    allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    // Use the "Managed-CachingOptimized" policy
                    // See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policies-list
                    cachePolicy: CachePolicy.CACHING_OPTIMIZED,
                    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                },
            },
            // Disable caching of error responses
            errorResponses: [
                {
                    httpStatus: 500,
                    ttl: Duration.seconds(0),
                },
                {
                    httpStatus: 504,
                    ttl: Duration.seconds(0),
                },
            ],
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

    commands(): Record<string, () => Promise<void>> {
        return {
            upload: this.uploadAssets.bind(this),
        };
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

        log(`Uploading directory '${this.configuration.assetsPath}' to bucket '${bucketName}'`);
        const { hasChanges } = await s3Sync({
            aws: this.provider,
            localPath: this.configuration.assetsPath,
            bucketName,
        });
        if (hasChanges) {
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
}
