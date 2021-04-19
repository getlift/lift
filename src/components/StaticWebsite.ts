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
        domain: { type: "string" },
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

export class StaticWebsite extends Component<
    typeof COMPONENT_NAME,
    typeof COMPONENT_DEFINITIONS
> {
    constructor(serverless: Serverless) {
        super({
            name: COMPONENT_NAME,
            serverless,
            schema: COMPONENT_DEFINITIONS,
        });

        this.commands = {
            "static-website-deploy": {
                lifecycleEvents: ["deploy"],
            },
        };

        this.hooks["after:deploy:deploy"] = this.deploy.bind(this);
        this.hooks["static-website-deploy:deploy"] = this.deploy.bind(this);
    }

    compile(): void {
        const configuration = this.getConfiguration();
        if (!configuration) {
            return;
        }

        Object.entries(configuration).map(
            ([websiteName, websiteConfiguration]) => {
                const cfId = formatCloudFormationId(`${websiteName}Website`);

                if (
                    websiteConfiguration.domain !== undefined &&
                    websiteConfiguration.certificate === undefined
                ) {
                    throw new Error(
                        `Invalid configuration for the static website ${websiteName}: if a domain is configured, then a certificate ARN must be configured as well.`
                    );
                }

                const bucket = new Bucket(
                    this.serverless.stack,
                    `${cfId}Bucket`,
                    {
                        // For a static website, the content is code that should be versioned elsewhere
                        removalPolicy: RemovalPolicy.DESTROY,
                    }
                );

                const cloudFrontOAI = new OriginAccessIdentity(
                    this.serverless.stack,
                    `${cfId}OriginAccessIdentity`,
                    {
                        // TODO improve the comment
                        comment: `OAI for ${websiteName} static website.`,
                    }
                );

                // Authorize CloudFront to access S3 via an "Origin Access Identity"
                const bucketPolicy = new BucketPolicy(
                    this.serverless.stack,
                    `${cfId}BucketPolicy`,
                    {
                        bucket: bucket,
                    }
                );
                const policyStatement = new PolicyStatement({
                    actions: ["s3:GetObject", "s3:ListBucket"],
                    resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
                });
                policyStatement.addCanonicalUserPrincipal(
                    cloudFrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId
                );
                bucketPolicy.document.addStatements(policyStatement);

                const distribution = new CloudFrontWebDistribution(
                    this.serverless.stack,
                    `${cfId}CDN`,
                    {
                        // Cheapest option by default (https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_DistributionConfig.html)
                        priceClass: PriceClass.PRICE_CLASS_100,
                        // Enable http2 transfer for better performances
                        httpVersion: HttpVersion.HTTP2,
                        viewerProtocolPolicy:
                            ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
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
                                        allowedMethods:
                                            CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
                                        cachedMethods:
                                            CloudFrontAllowedCachedMethods.GET_HEAD_OPTIONS,
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
                        viewerCertificate: this.compileViewerCertificate(
                            websiteConfiguration
                        ),
                    }
                );

                // CloudFormation outputs
                new CfnOutput(this.serverless.stack, `${cfId}BucketName`, {
                    description:
                        "Name of the bucket that stores the static website.",
                    value: bucket.bucketName,
                });
                new CfnOutput(this.serverless.stack, `${cfId}Domain`, {
                    description: "CloudFront domain name.",
                    value: distribution.distributionDomainName,
                });
            }
        );
    }

    private compileViewerCertificate(config: WebsiteConfiguration) {
        if (config.certificate === undefined) {
            return undefined;
        }

        return {
            aliases: config.domain !== undefined ? [config.domain] : [],
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
        for (const [websiteName, configuration] of Object.entries(
            this.getConfiguration() ?? {}
        )) {
            await this.deployWebsite(websiteName, configuration);
        }
    }

    private async deployWebsite(
        name: string,
        configuration: WebsiteConfiguration
    ) {
        log(`Deploying the static website "${name}"`);

        const cfId = formatCloudFormationId(`${name}Website`);
        const bucketName = await getStackOutput(
            this.serverless,
            `${cfId}BucketName`
        );
        if (bucketName === undefined) {
            throw new Error(
                "Could not find the bucket in which to deploy the website: run 'serverless deploy' first to create it."
            );
        }

        log(
            `Uploading directory '${configuration.path}' to bucket '${bucketName}'`
        );
        // TODO proper upload, without going through a subcommand
        spawnSync(
            "aws",
            [
                "s3",
                "sync",
                "--delete",
                configuration.path,
                `s3://${bucketName}`,
            ],
            {
                stdio: "inherit",
            }
        );
    }

    async permissions(): Promise<PolicyStatement[]> {
        return Promise.resolve([]);
    }
}
