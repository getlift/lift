import { Bucket, BucketPolicy } from "@aws-cdk/aws-s3";
import { PolicyStatement } from "@aws-cdk/aws-iam";
import {
    CloudFrontAllowedCachedMethods,
    CloudFrontAllowedMethods,
    CloudFrontWebDistribution,
    HttpVersion,
    OriginAccessIdentity,
    PriceClass,
    ViewerCertificate,
    ViewerProtocolPolicy,
} from "@aws-cdk/aws-cloudfront";
import { CfnOutput, Duration, RemovalPolicy } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { spawnSync } from "child_process";
import {
    DeleteObjectsOutput,
    DeleteObjectsRequest,
    ListObjectsV2Output,
    ListObjectsV2Request,
} from "aws-sdk/clients/s3";
import chalk from "chalk";
import { CreateInvalidationRequest, CreateInvalidationResult } from "aws-sdk/clients/cloudfront";
import { Component } from "../classes/Component";
import { Serverless } from "../types/serverless";
import { formatCloudFormationId, getStackOutput } from "../CloudFormation";
import { log } from "../utils/logger";

const LIFT_COMPONENT_NAME_PATTERN = "^[a-zA-Z0-9-_]+$";
const COMPONENT_NAME = "static-website";
const COMPONENT_DEFINITION = {
    type: "object",
    properties: {
        path: { type: "string" },
        domain: {
            oneOf: [
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
const COMPONENT_DEFINITIONS = {
    type: "object",
    patternProperties: {
        [LIFT_COMPONENT_NAME_PATTERN]: COMPONENT_DEFINITION,
    },
} as const;

type WebsiteConfiguration = FromSchema<typeof COMPONENT_DEFINITION>;

export class StaticWebsite extends Component<typeof COMPONENT_NAME, typeof COMPONENT_DEFINITIONS> {
    constructor(serverless: Serverless) {
        super({
            name: COMPONENT_NAME,
            serverless,
            schema: COMPONENT_DEFINITIONS,
        });

        this.commands = {
            "static-website": {
                commands: {
                    // Sub-command: `serverless static-website deploy`
                    deploy: {
                        lifecycleEvents: ["deploy"],
                    },
                },
            },
        };

        this.hooks["after:deploy:deploy"] = this.deploy.bind(this);
        this.hooks["static-website:deploy:deploy"] = this.deploy.bind(this);

        this.hooks["before:remove:remove"] = this.remove.bind(this);

        this.hooks["after:info:info"] = this.info.bind(this);
    }

    compile(): void {
        const configuration = this.getConfiguration();
        if (!configuration) {
            return;
        }

        Object.entries(configuration).map(([websiteName, websiteConfiguration]) => {
            const cfId = formatCloudFormationId(`${websiteName}Website`);

            if (websiteConfiguration.domain !== undefined && websiteConfiguration.certificate === undefined) {
                throw new Error(
                    `Invalid configuration for the static website ${websiteName}: if a domain is configured, then a certificate ARN must be configured as well.`
                );
            }

            const bucket = new Bucket(this.serverless.stack, `${cfId}Bucket`, {
                // For a static website, the content is code that should be versioned elsewhere
                removalPolicy: RemovalPolicy.DESTROY,
            });

            const cloudFrontOAI = new OriginAccessIdentity(this.serverless.stack, `${cfId}OriginAccessIdentity`, {
                // TODO improve the comment
                comment: `OAI for ${websiteName} static website.`,
            });

            // Authorize CloudFront to access S3 via an "Origin Access Identity"
            const bucketPolicy = new BucketPolicy(this.serverless.stack, `${cfId}BucketPolicy`, {
                bucket: bucket,
            });
            const policyStatement = new PolicyStatement({
                actions: ["s3:GetObject", "s3:ListBucket"],
                resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
            });
            policyStatement.addCanonicalUserPrincipal(cloudFrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId);
            bucketPolicy.document.addStatements(policyStatement);

            const distribution = new CloudFrontWebDistribution(this.serverless.stack, `${cfId}CDN`, {
                // Cheapest option by default (https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_DistributionConfig.html)
                priceClass: PriceClass.PRICE_CLASS_100,
                // Enable http2 transfer for better performances
                httpVersion: HttpVersion.HTTP2,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                // Send all page requests to index.html
                defaultRootObject: "index.html",
                // Origins are where CloudFront fetches content
                originConfigs: [
                    {
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
                // For SPA we need dynamic pages to be served by index.html
                errorConfigurations: [
                    {
                        errorCode: 404,
                        errorCachingMinTtl: 0,
                        responseCode: 200,
                        responsePagePath: "/index.html",
                    },
                ],
                viewerCertificate: this.compileViewerCertificate(websiteConfiguration),
            });

            // CloudFormation outputs
            new CfnOutput(this.serverless.stack, `${cfId}BucketName`, {
                description: "Name of the bucket that stores the static website.",
                value: bucket.bucketName,
            });
            let websiteDomain: string = distribution.distributionDomainName;
            if (websiteConfiguration.domain !== undefined) {
                // In case of multiple domains, we take the first one
                websiteDomain =
                    typeof websiteConfiguration.domain === "string"
                        ? websiteConfiguration.domain
                        : websiteConfiguration.domain[0];
            }
            new CfnOutput(this.serverless.stack, `${cfId}Domain`, {
                description: "Website domain name.",
                value: websiteDomain,
            });
            new CfnOutput(this.serverless.stack, `${cfId}CloudFrontDomain`, {
                description: "CloudFront CNAME.",
                value: distribution.distributionDomainName,
            });
            new CfnOutput(this.serverless.stack, `${cfId}DistributionId`, {
                description: "ID of the CloudFront distribution.",
                value: distribution.distributionId,
            });
        });
    }

    private compileViewerCertificate(config: WebsiteConfiguration) {
        if (config.certificate === undefined) {
            return undefined;
        }

        let aliases: string[] = [];
        if (config.domain !== undefined) {
            aliases = typeof config.domain === "string" ? [config.domain] : config.domain;
        }

        return {
            aliases: aliases,
            props: {
                acmCertificateArn: config.certificate,
                // See https://docs.aws.amazon.com/fr_fr/cloudfront/latest/APIReference/API_ViewerCertificate.html
                sslSupportMethod: "sni-only",
                minimumProtocolVersion: "TLSv1.1_2016",
            },
        } as ViewerCertificate;
    }

    async deploy(): Promise<void> {
        // Deploy each website sequentially (to simplify the log output)
        for (const [websiteName, configuration] of Object.entries(this.getConfiguration() ?? {})) {
            await this.deployWebsite(websiteName, configuration);
        }
    }

    private async deployWebsite(name: string, configuration: WebsiteConfiguration) {
        log(`Deploying the static website '${name}'`);

        const cfId = formatCloudFormationId(`${name}Website`);
        const bucketName = await getStackOutput(this.serverless, `${cfId}BucketName`);
        if (bucketName === undefined) {
            throw new Error(
                `Could not find the bucket in which to deploy the '${name}' website: did you forget to run 'serverless deploy' first?`
            );
        }

        log(`Uploading directory '${configuration.path}' to bucket '${bucketName}'`);
        // TODO proper upload, without going through a subcommand
        spawnSync("aws", ["s3", "sync", "--delete", configuration.path, `s3://${bucketName}`], {
            stdio: "inherit",
        });
        await this.clearCDNCache(name);
    }

    async remove(): Promise<void> {
        for (const websiteName of Object.keys(this.getConfiguration() ?? {})) {
            const cfId = formatCloudFormationId(`${websiteName}Website`);
            const bucketName = await getStackOutput(this.serverless, `${cfId}BucketName`);
            if (bucketName === undefined) {
                // No bucket found => nothing to delete!
                return;
            }

            log(
                `Emptying S3 bucket '${bucketName}' for the '${websiteName}' static website, else CloudFormation will fail (it cannot delete a non-empty bucket)`
            );
            await this.emptyBucket(bucketName);
        }
    }

    private async emptyBucket(bucket: string): Promise<void> {
        const aws = this.serverless.getProvider("aws");
        const data = await aws.request<ListObjectsV2Request, ListObjectsV2Output>("S3", "listObjectsV2", {
            Bucket: bucket,
        });
        if (data.Contents === undefined) {
            return;
        }
        const keys = data.Contents.map((item) => item.Key).filter((key): key is string => key !== undefined);
        await aws.request<DeleteObjectsRequest, DeleteObjectsOutput>("S3", "deleteObjects", {
            Bucket: bucket,
            Delete: {
                Objects: keys.map((key) => ({ Key: key })),
            },
        });
    }

    async info(): Promise<void> {
        const lines: string[] = [];
        const config = this.getConfiguration() ?? {};
        await Promise.all(
            Object.keys(config).map(async (website) => {
                const cfId = formatCloudFormationId(`${website}Website`);

                const domain = await getStackOutput(this.serverless, `${cfId}Domain`);
                if (domain === undefined) {
                    return;
                }
                const cname = await getStackOutput(this.serverless, `${cfId}CloudFrontDomain`);
                if (cname === undefined) {
                    return;
                }
                if (domain !== cname) {
                    lines.push(`  ${website}: https://${domain} (CNAME: ${cname})`);
                } else {
                    lines.push(`  ${website}: https://${domain}`);
                }
            })
        );
        if (lines.length <= 0) {
            return;
        }
        console.log(chalk.yellow("static websites:"));
        for (const line of lines) {
            console.log(line);
        }
    }

    async permissions(): Promise<PolicyStatement[]> {
        return Promise.resolve([]);
    }

    private async clearCDNCache(websiteName: string) {
        const cfId = formatCloudFormationId(`${websiteName}Website`);
        const aws = this.serverless.getProvider("aws");
        const distributionId = await getStackOutput(this.serverless, `${cfId}DistributionId`);
        if (distributionId === undefined) {
            return;
        }
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
}
