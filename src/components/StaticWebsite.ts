/* eslint-disable */
import { Component } from "./Component";
import {
    CloudFormationOutputs,
    CloudFormationResource,
    CloudFormationResources,
    PolicyStatement,
    Stack,
} from "../Stack";

export class StaticWebsite extends Component {
    private readonly props: Record<string, unknown>;
    private readonly bucketResourceName: string;

    constructor(stack: Stack, props: Record<string, unknown> | null) {
        super(stack);
        this.props = props ? props : {};

        this.bucketResourceName = this.formatCloudFormationId("StaticWebsite");
    }

    compile(): CloudFormationResources {
        const bucket: CloudFormationResource = {
            Type: "AWS::S3::Bucket",
            Properties: {
                WebsiteConfiguration: {
                    IndexDocument: "index.html",
                    ErrorDocument: "index.html",
                },
            },
        };

        if (this.props.cors === true) {
            bucket.Properties.CorsConfiguration = {
                CorsRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["GET"],
                        AllowedOrigins: ["*"],
                    },
                ],
            };
        }

        const resources: CloudFormationResources = {
            [this.bucketResourceName]: bucket,
        };

        resources[this.bucketResourceName + "BucketPolicy"] = {
            Type: "AWS::S3::BucketPolicy",
            Properties: {
                Bucket: this.fnRef(this.bucketResourceName),
                PolicyDocument: {
                    Statement: [
                        {
                            Effect: "Allow",
                            Principal: "*",
                            Action: "s3:GetObject",
                            Resource: this.fnJoin("", [
                                this.fnGetAtt(this.bucketResourceName, "Arn"),
                                "/*",
                            ]),
                        },
                    ],
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
                            DomainName: {
                                "Fn::Select": [
                                    2,
                                    {
                                        "Fn::Split": [
                                            "/",
                                            this.fnGetAtt(
                                                this.bucketResourceName,
                                                "WebsiteURL"
                                            ),
                                        ],
                                    },
                                ],
                            },
                            CustomOriginConfig: {
                                // S3 websites only support HTTP
                                // (this is only accessed by CloudFront, visitors will be using HTTPS)
                                OriginProtocolPolicy: "http-only",
                            },
                        },
                    ],
                    DefaultCacheBehavior: {
                        TargetOriginId: "StaticWebsite",
                        AllowedMethods: ["GET", "HEAD"],
                        CachedMethods: ["GET", "HEAD"],
                        ForwardedValues: {
                            // Do not forward the query string or cookies
                            QueryString: "false",
                            Cookies: {
                                Forward: "none",
                            },
                        },
                        ViewerProtocolPolicy: "redirect-to-https",
                        // Serve files with gzip for browsers that support it (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html)
                        Compress: "true",
                    },
                },
            },
        };

        // Custom domain on CloudFront
        if (
            typeof this.props.domain === "string" ||
            this.props.domain instanceof String
        ) {
            if (
                !(
                    typeof this.props.certificate === "string" ||
                    this.props.certificate instanceof String
                )
            ) {
                throw new Error(
                    "Invalid configuration for the static website: if a domain is configured, then a certificate ARN must be configured as well."
                );
            }
            // @ts-ignore
            resources.WebsiteCDN.Properties.DistributionConfig["Aliases"] = [
                this.props.domain,
            ];
            // @ts-ignore
            resources.WebsiteCDN.Properties.DistributionConfig[
                "ViewerCertificate"
            ] = {
                AcmCertificateArn: this.props.certificate,
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
                Value: this.fnRef(this.bucketResourceName),
            },
            CloudFrontDomain: {
                Description: "CloudFront domain name.",
                Value: this.fnGetAtt("WebsiteCDN", "DomainName"),
            },
        };
    }

    async permissionsReferences(): Promise<PolicyStatement[]> {
        return Promise.resolve([]);
    }
}
