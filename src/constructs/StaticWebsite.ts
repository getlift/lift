import { Bucket } from "@aws-cdk/aws-s3";
import {
    AllowedMethods,
    CachePolicy,
    Distribution,
    FunctionEventType,
    HttpVersion,
    OriginAccessIdentity,
    ViewerProtocolPolicy,
} from "@aws-cdk/aws-cloudfront";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import { Construct as CdkConstruct, CfnOutput, Duration, RemovalPolicy } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import {
    DeleteObjectsOutput,
    DeleteObjectsRequest,
    ListObjectsV2Output,
    ListObjectsV2Request,
} from "aws-sdk/clients/s3";
import chalk from "chalk";
import { CreateInvalidationRequest, CreateInvalidationResult } from "aws-sdk/clients/cloudfront";
import { S3Origin } from "@aws-cdk/aws-cloudfront-origins";
import * as acm from "@aws-cdk/aws-certificatemanager";
import { flatten } from "lodash";
import { ErrorResponse } from "@aws-cdk/aws-cloudfront/lib/distribution";
import { log } from "../utils/logger";
import { s3Sync } from "../utils/s3-sync";
import { AwsConstruct } from "../classes";
import { AwsProvider } from "../providers";
import { ConstructCommands } from "../classes/Construct";
import ServerlessError from "../utils/error";

const STATIC_WEBSITE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "static-website" },
        path: { type: "string" },
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
        security: {
            type: "object",
            properties: {
                allowIframe: { type: "boolean" },
            },
            additionalProperties: false,
        },
        errorPage: { type: "string" },
    },
    additionalProperties: false,
    required: ["path"],
} as const;

type Configuration = FromSchema<typeof STATIC_WEBSITE_DEFINITION>;

export class StaticWebsite extends AwsConstruct {
    public static type = "static-website";
    public static schema = STATIC_WEBSITE_DEFINITION;
    public static commands: ConstructCommands = {
        upload: {
            usage: "Upload files directly to S3 without going through a CloudFormation deployment.",
            handler: StaticWebsite.prototype.uploadWebsite,
        },
    };

    private readonly bucketNameOutput: CfnOutput;
    private readonly domainOutput: CfnOutput;
    private readonly cnameOutput: CfnOutput;
    private readonly distributionIdOutput: CfnOutput;

    constructor(
        scope: CdkConstruct,
        private readonly id: string,
        private readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);

        if (configuration.domain !== undefined && configuration.certificate === undefined) {
            throw new ServerlessError(
                `Invalid configuration for the static website '${id}': if a domain is configured, then a certificate ARN must be configured in the 'certificate' option.\n` +
                    "See https://github.com/getlift/lift/blob/master/docs/static-website.md#custom-domain",
                "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
            );
        }

        const bucket = new Bucket(this, "Bucket", {
            // For a static website, the content is code that should be versioned elsewhere
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const cloudFrontOAI = new OriginAccessIdentity(this, "OriginAccessIdentity", {
            comment: `Identity that represents CloudFront for the ${id} static website.`,
        });
        bucket.grantRead(cloudFrontOAI);

        // Cast the domains to an array
        const domains = configuration.domain !== undefined ? flatten([configuration.domain]) : undefined;
        const certificate =
            configuration.certificate !== undefined
                ? acm.Certificate.fromCertificateArn(this, "Certificate", configuration.certificate)
                : undefined;
        const distribution = new Distribution(this, "CDN", {
            comment: `${provider.stackName} ${id} website CDN`,
            // Send all page requests to index.html
            defaultRootObject: "index.html",
            defaultBehavior: {
                // Origins are where CloudFront fetches content
                origin: new S3Origin(bucket, {
                    originAccessIdentity: cloudFrontOAI,
                }),
                allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                // Use the "Managed-CachingOptimized" policy
                // See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policies-list
                cachePolicy: CachePolicy.CACHING_OPTIMIZED,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                functionAssociations: [
                    {
                        function: this.createResponseFunction(),
                        eventType: FunctionEventType.VIEWER_RESPONSE,
                    },
                ],
            },
            errorResponses: [this.errorResponse()],
            // Enable http2 transfer for better performances
            httpVersion: HttpVersion.HTTP2,
            certificate: certificate,
            domainNames: domains,
        });

        // CloudFormation outputs
        this.bucketNameOutput = new CfnOutput(this, "BucketName", {
            description: "Name of the bucket that stores the static website.",
            value: bucket.bucketName,
        });
        let websiteDomain: string = distribution.distributionDomainName;
        if (configuration.domain !== undefined) {
            // In case of multiple domains, we take the first one
            websiteDomain = typeof configuration.domain === "string" ? configuration.domain : configuration.domain[0];
        }
        this.domainOutput = new CfnOutput(this, "Domain", {
            description: "Website domain name.",
            value: websiteDomain,
        });
        this.cnameOutput = new CfnOutput(this, "CloudFrontCName", {
            description: "CloudFront CNAME.",
            value: distribution.distributionDomainName,
        });
        this.distributionIdOutput = new CfnOutput(this, "DistributionId", {
            description: "ID of the CloudFront distribution.",
            value: distribution.distributionId,
        });
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            url: () => this.getUrl(),
            cname: () => this.getCName(),
        };
    }

    async postDeploy(): Promise<void> {
        await this.uploadWebsite();
    }

    async uploadWebsite(): Promise<void> {
        log(`Deploying the static website '${this.id}'`);

        const bucketName = await this.getBucketName();
        if (bucketName === undefined) {
            throw new ServerlessError(
                `Could not find the bucket in which to deploy the '${this.id}' website: did you forget to run 'serverless deploy' first?`,
                "LIFT_MISSING_STACK_OUTPUT"
            );
        }

        log(`Uploading directory '${this.configuration.path}' to bucket '${bucketName}'`);
        const { hasChanges } = await s3Sync({
            aws: this.provider,
            localPath: this.configuration.path,
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
        await this.provider.request<CreateInvalidationRequest, CreateInvalidationResult>(
            "CloudFront",
            "createInvalidation",
            {
                DistributionId: distributionId,
                InvalidationBatch: {
                    // This should be a unique ID: we use a timestamp
                    CallerReference: Date.now().toString(),
                    Paths: {
                        // Invalidate everything
                        Items: ["/*"],
                        Quantity: 1,
                    },
                },
            }
        );
    }

    async preRemove(): Promise<void> {
        const bucketName = await this.getBucketName();
        if (bucketName === undefined) {
            // No bucket found => nothing to delete!
            return;
        }

        log(
            `Emptying S3 bucket '${bucketName}' for the '${this.id}' static website, else CloudFormation will fail (it cannot delete a non-empty bucket)`
        );
        const data = await this.provider.request<ListObjectsV2Request, ListObjectsV2Output>("S3", "listObjectsV2", {
            Bucket: bucketName,
        });
        if (data.Contents === undefined) {
            return;
        }
        const keys = data.Contents.map((item) => item.Key).filter((key): key is string => key !== undefined);
        await this.provider.request<DeleteObjectsRequest, DeleteObjectsOutput>("S3", "deleteObjects", {
            Bucket: bucketName,
            Delete: {
                Objects: keys.map((key) => ({ Key: key })),
            },
        });
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

    private errorResponse(): ErrorResponse {
        // Custom error page
        if (this.configuration.errorPage !== undefined) {
            let errorPath = this.configuration.errorPage;
            if (errorPath.startsWith("./") || errorPath.startsWith("../")) {
                throw new ServerlessError(
                    `The 'errorPage' option of the '${this.id}' static website cannot start with './' or '../'. ` +
                        `(it cannot be a relative path).`,
                    "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
                );
            }
            if (!errorPath.startsWith("/")) {
                errorPath = `/${errorPath}`;
            }

            return {
                httpStatus: 404,
                ttl: Duration.seconds(0),
                responseHttpStatus: 404,
                responsePagePath: errorPath,
            };
        }

        /**
         * The default behavior is optimized for SPA: all unknown URLs are served
         * by index.html so that routing can be done client-side.
         */
        return {
            httpStatus: 404,
            ttl: Duration.seconds(0),
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
        };
    }

    private createResponseFunction(): cloudfront.Function {
        const securityHeaders: Record<string, { value: string }> = {
            "x-frame-options": { value: "SAMEORIGIN" },
            "x-content-type-options": { value: "nosniff" },
            "x-xss-protection": { value: "1; mode=block" },
            "strict-transport-security": { value: "max-age=63072000" },
        };
        if (this.configuration.security?.allowIframe === true) {
            delete securityHeaders["x-frame-options"];
        }
        const jsonHeaders = JSON.stringify(securityHeaders, undefined, 4);
        /**
         * CloudFront function that manipulates the HTTP responses to add security headers.
         */
        const code = `function handler(event) {
    var response = event.response;
    response.headers = Object.assign({}, ${jsonHeaders}, response.headers);
    return response;
}`;

        return new cloudfront.Function(this, "ResponseFunction", {
            functionName: `${this.provider.stackName}-${this.provider.region}-${this.id}-response`,
            code: cloudfront.FunctionCode.fromInline(code),
        });
    }
}
