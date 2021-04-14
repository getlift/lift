/* eslint-disable */
import {
    CloudFormationOutputs,
    CloudFormationResource,
    CloudFormationResources,
    PolicyStatement,
    Stack,
} from "../Stack";
import { Component } from "../classes/Component";
import { Serverless } from "../types/serverless";
import { cfGetAtt, cfJoin, cfRef } from "../CloudFormation";

const LIFT_COMPONENT_NAME_PATTERN = "^[a-zA-Z0-9-_]+$";
const COMPONENT_NAME = "static-websites";
const COMPONENT_DEFINITION = {
    type: "object",
    patternProperties: {
        [LIFT_COMPONENT_NAME_PATTERN]: {
            type: "object",
            properties: {
                cors: {
                    anyOf: [{ type: "boolean" }, { type: "string" }],
                },
                encrypted: { type: "boolean" },
                public: { type: "boolean" },
            },
            additionalProperties: false,
        },
    },
} as const;

export class StaticWebsite extends Component<
    typeof COMPONENT_NAME,
    typeof COMPONENT_DEFINITION
> {
    private readonly bucketResourceName: string;
    private readonly stack: Stack;
    private hooks: Record<string, () => void>;

    constructor(serverless: Serverless, stack: Stack) {
        super({
            name: COMPONENT_NAME,
            serverless,
            schema: COMPONENT_DEFINITION,
        });

        this.stack = stack;

        // TODO standardize naming
        // this.bucketResourceName = this.formatCloudFormationId("StaticWebsite");
        this.bucketResourceName = "StaticWebsite";

        this.hooks = {
            "before:package:initialize": this.doCompile.bind(this),
        };
    }

    doCompile(): void {
        this.serverless.service.resources =
            this.serverless.service.resources ?? {};
        this.serverless.service.resources.Resources =
            this.serverless.service.resources.Resources ?? {};
        this.serverless.service.resources.Outputs =
            this.serverless.service.resources.Outputs ?? {};

        Object.assign(
            this.serverless.service.resources.Resources,
            this.compile()
        );
        Object.assign(
            this.serverless.service.resources.Outputs,
            this.outputs()
        );
    }

    compile(): CloudFormationResources {
        const config = this.getConfiguration();

        const bucket: CloudFormationResource = {
            Type: "AWS::S3::Bucket",
            Properties: {},
        };

        const originAccessIdentityResourceId =
            this.bucketResourceName + "OriginAccessIdentity";

        const resources: CloudFormationResources = {
            [this.bucketResourceName]: bucket,
            [originAccessIdentityResourceId]: {
                Type: "AWS::CloudFront::CloudFrontOriginAccessIdentity",
                Properties: {
                    CloudFrontOriginAccessIdentityConfig: {
                        // TODO improve the comment
                        Comment: cfRef(this.bucketResourceName),
                    },
                },
            },
            [this.bucketResourceName + "BucketPolicy"]: {
                Type: "AWS::S3::BucketPolicy",
                Properties: {
                    Bucket: cfRef(this.bucketResourceName),
                    PolicyDocument: {
                        Statement: [
                            // Authorize CloudFront to access S3 via an "Origin Access Identity"
                            {
                                Effect: "Allow",
                                Principal: {
                                    CanonicalUser: cfGetAtt(
                                        originAccessIdentityResourceId,
                                        "S3CanonicalUserId"
                                    ),
                                },
                                Action: ["s3:GetObject", "s3:ListBucket"],
                                Resource: [
                                    cfGetAtt(this.bucketResourceName, "Arn"),
                                    cfJoin("", [
                                        cfGetAtt(
                                            this.bucketResourceName,
                                            "Arn"
                                        ),
                                        "/*",
                                    ]),
                                ],
                            },
                        ],
                    },
                },
            },
        };

        resources.WebsiteCDN = {
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Enabled: "true",
                    // Cheapest option by default (https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_DistributionConfig.html)
                    PriceClass: "PriceClass_100",
                    // Enable http2 transfer for better performances
                    HttpVersion: "http2",
                    // Origins are where CloudFront fetches content
                    Origins: [
                        {
                            Id: "StaticWebsite",
                            DomainName: cfGetAtt(
                                this.bucketResourceName,
                                "RegionalDomainName"
                            ),
                            S3OriginConfig: {
                                OriginAccessIdentity: cfJoin("", [
                                    "origin-access-identity/cloudfront/",
                                    cfRef(originAccessIdentityResourceId),
                                ]),
                            },
                        },
                    ],
                    DefaultCacheBehavior: {
                        TargetOriginId: "StaticWebsite",
                        AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                        CachedMethods: ["GET", "HEAD", "OPTIONS"],
                        ForwardedValues: {
                            // Do not forward the query string or cookies
                            QueryString: "false",
                            Cookies: {
                                Forward: "none",
                            },
                        },
                        // Redirect to HTTPS by default
                        ViewerProtocolPolicy: "redirect-to-https",
                        // Serve files with gzip for browsers that support it (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html)
                        Compress: "true",
                        // Cache files for 1 hour by default
                        DefaultTTL: 3600,
                    },
                    // Send all page requests to index.html
                    DefaultRootObject: "index.html",
                    // For SPA we need dynamic pages to be served by index.html
                    CustomErrorResponses: [
                        {
                            ErrorCode: 404,
                            ErrorCachingMinTTL: 0,
                            ResponseCode: 200,
                            ResponsePagePath: "/index.html",
                        },
                    ],
                },
            },
        };

        // Custom domain on CloudFront
        if (
            typeof config.domain === "string" ||
            config.domain instanceof String
        ) {
            if (
                !(
                    typeof config.certificate === "string" ||
                    config.certificate instanceof String
                )
            ) {
                throw new Error(
                    "Invalid configuration for the static website: if a domain is configured, then a certificate ARN must be configured as well."
                );
            }
            // @ts-ignore
            resources.WebsiteCDN.Properties.DistributionConfig["Aliases"] = [
                config.domain,
            ];
            // @ts-ignore
            resources.WebsiteCDN.Properties.DistributionConfig[
                "ViewerCertificate"
            ] = {
                AcmCertificateArn: config.certificate,
                // See https://docs.aws.amazon.com/fr_fr/cloudfront/latest/APIReference/API_ViewerCertificate.html
                SslSupportMethod: "sni-only",
                MinimumProtocolVersion: "TLSv1.1_2016",
            };
        }

        return resources;
    }

    outputs(): CloudFormationOutputs {
        return {
            [this.bucketResourceName + "Bucket"]: {
                Description:
                    "Name of the bucket that stores the static website.",
                Value: cfRef(this.bucketResourceName),
            },
            CloudFrontDomain: {
                Description: "CloudFront domain name.",
                Value: cfGetAtt("WebsiteCDN", "DomainName"),
            },
        };
    }

    async permissionsReferences(): Promise<PolicyStatement[]> {
        return Promise.resolve([]);
    }
}
