import { FromSchema } from "json-schema-to-ts";
import { Bucket } from "@aws-cdk/aws-s3";
import { CfnOutput, Duration, RemovalPolicy } from "@aws-cdk/core";
import {
    CloudFrontAllowedCachedMethods,
    CloudFrontAllowedMethods,
    CloudFrontWebDistribution,
    OriginAccessIdentity,
} from "@aws-cdk/aws-cloudfront";
import { spawnSync } from "child_process";
import chalk from "chalk";
import { CreateInvalidationRequest, CreateInvalidationResult } from "aws-sdk/clients/cloudfront";
import {
    DeleteObjectsOutput,
    DeleteObjectsRequest,
    ListObjectsV2Output,
    ListObjectsV2Request,
} from "aws-sdk/clients/s3";
import { log } from "../utils/logger";
import type { Serverless } from "../types/serverless";
import { AwsComponent } from "./AwsComponent";

export const STATIC_WEBSITE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "static-website" },
        path: { type: "string" },
        domain: {
            anyOf: [
                { type: "string" },
                {
                    type: "array",
                    items: {
                        type: "string",
                    },
                },
            ],
        },
        certificate: { type: "string" },
    },
    additionalProperties: false,
    required: ["path"],
} as const;

export class StaticWebsite extends AwsComponent<typeof STATIC_WEBSITE_DEFINITION> {
    private readonly bucketNameOutput: CfnOutput;
    private readonly domainOutput: CfnOutput;
    private readonly cnameOutput: CfnOutput;
    private readonly distributionIdOutput: CfnOutput;

    constructor(serverless: Serverless, id: string, configuration: FromSchema<typeof STATIC_WEBSITE_DEFINITION>) {
        super(serverless, id, STATIC_WEBSITE_DEFINITION, configuration);

        if (configuration.domain !== undefined && configuration.certificate === undefined) {
            throw new Error(
                `Invalid configuration for the static website ${id}: if a domain is configured, then a certificate ARN must be configured as well.`
            );
        }

        const bucket = new Bucket(this.stack, "Bucket", {
            // For a static website, the content is code that should be versioned elsewhere
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const cloudFrontOAI = new OriginAccessIdentity(this.stack, "OriginAccessIdentity", {
            comment: `Identity that represents CloudFront for the ${id} static website.`,
        });

        const distribution = new CloudFrontWebDistribution(this.stack, "CDN", {
            originConfigs: [
                {
                    // The CDK will automatically allow CloudFront to access S3 via the "Origin Access Identity"
                    s3OriginSource: {
                        s3BucketSource: bucket,
                        originAccessIdentity: cloudFrontOAI,
                    },
                    behaviors: [
                        {
                            isDefaultBehavior: true,
                            allowedMethods: CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
                            cachedMethods: CloudFrontAllowedCachedMethods.GET_HEAD_OPTIONS,
                            forwardedValues: {
                                // Do not forward the query string or cookies
                                queryString: false,
                                cookies: {
                                    forward: "none",
                                },
                            },
                            // Serve files with gzip for browsers that support it (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html)
                            compress: true,
                            // Cache files in CloudFront for 1 hour by default
                            defaultTtl: Duration.hours(1),
                        },
                    ],
                },
            ],
            // ...
        });

        // CloudFormation outputs
        this.bucketNameOutput = new CfnOutput(this.stack, "BucketName", {
            description: "Name of the bucket that stores the static website.",
            value: bucket.bucketName,
        });
        let websiteDomain: string = distribution.distributionDomainName;
        if (configuration.domain !== undefined) {
            // In case of multiple domains, we take the first one
            websiteDomain = typeof configuration.domain === "string" ? configuration.domain : configuration.domain[0];
        }
        this.domainOutput = new CfnOutput(this.stack, "Domain", {
            description: "Website domain name.",
            value: websiteDomain,
        });
        this.cnameOutput = new CfnOutput(this.stack, "CloudFrontCName", {
            description: "CloudFront CNAME.",
            value: distribution.distributionDomainName,
        });
        this.distributionIdOutput = new CfnOutput(this.stack, "DistributionId", {
            description: "ID of the CloudFront distribution.",
            value: distribution.distributionId,
        });
    }

    commands(): Record<string, () => Promise<void>> {
        return {
            upload: this.uploadFiles.bind(this),
        };
    }

    async deploy(): Promise<void> {
        // Deploy the CloudFormation stack
        await super.deploy();
        // Deploy the files to S3
        await this.uploadFiles();
    }

    async remove(): Promise<void> {
        // Clear the bucket else the stack deletion will fail
        await this.emptyBucket();
        await super.remove();
    }

    private async uploadFiles(): Promise<void> {
        log(`Deploying the static website '${this.id}'`);

        const bucketName = await this.getBucketName();
        if (bucketName === undefined) {
            throw new Error(
                `Could not find the bucket in which to deploy the '${this.id}' website: did you forget to run 'serverless deploy' first?`
            );
        }

        log(`Uploading directory '${this.configuration.path}' to bucket '${bucketName}'`);
        // TODO proper upload, without going through a subcommand
        spawnSync("aws", ["s3", "sync", "--delete", this.configuration.path, `s3://${bucketName}`], {
            stdio: "inherit",
        });
        await this.clearCDNCache();

        const domain = await this.getDomain();
        if (domain !== undefined) {
            log("Deployed " + chalk.green(`https://${domain}`));
        }
    }

    private async clearCDNCache(): Promise<void> {
        const distributionId = await this.getDistributionId();
        if (distributionId === undefined) {
            return;
        }
        const aws = this.serverless.getProvider("aws");
        await aws.request<CreateInvalidationRequest, CreateInvalidationResult>("CloudFront", "createInvalidation", {
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
        });
    }

    private async emptyBucket(): Promise<void> {
        const bucketName = await this.getBucketName();
        if (bucketName === undefined) {
            // No bucket found => nothing to delete!
            return;
        }

        log(
            `Emptying S3 bucket '${bucketName}' for the '${this.id}' static website, else CloudFormation will fail (it cannot delete a non-empty bucket)`
        );
        const aws = this.serverless.getProvider("aws");
        const data = await aws.request<ListObjectsV2Request, ListObjectsV2Output>("S3", "listObjectsV2", {
            Bucket: bucketName,
        });
        if (data.Contents === undefined) {
            return;
        }
        const keys = data.Contents.map((item) => item.Key).filter((key): key is string => key !== undefined);
        await aws.request<DeleteObjectsRequest, DeleteObjectsOutput>("S3", "deleteObjects", {
            Bucket: bucketName,
            Delete: {
                Objects: keys.map((key) => ({ Key: key })),
            },
        });
    }

    async infoOutput(): Promise<string | undefined> {
        const domain = await this.getDomain();
        if (domain === undefined) {
            return;
        }
        const cname = await this.getCName();
        if (cname === undefined) {
            return;
        }
        if (domain !== cname) {
            return `https://${domain} (CNAME: ${cname})`;
        }

        return `https://${domain}`;
    }

    variables(): Record<string, () => Promise<string | undefined>> {
        return {
            domain: this.getDomain.bind(this),
        };
    }

    async getBucketName(): Promise<string | undefined> {
        return this.getOutputValue(this.bucketNameOutput);
    }

    async getDomain(): Promise<string | undefined> {
        return this.getOutputValue(this.domainOutput);
    }

    async getCName(): Promise<string | undefined> {
        return this.getOutputValue(this.cnameOutput);
    }

    async getDistributionId(): Promise<string | undefined> {
        return this.getOutputValue(this.distributionIdOutput);
    }
}
