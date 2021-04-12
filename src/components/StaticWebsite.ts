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
                        Comment: this.fnRef(this.bucketResourceName),
                    },
                },
            },
            [this.bucketResourceName + "BucketPolicy"]: {
                Type: "AWS::S3::BucketPolicy",
                Properties: {
                    Bucket: this.fnRef(this.bucketResourceName),
                    PolicyDocument: {
                        Statement: [
                            // Authorize CloudFront to access S3 via an "Origin Access Identity"
                            {
                                Effect: "Allow",
                                Principal: {
                                    CanonicalUser: this.fnGetAtt(
                                        originAccessIdentityResourceId,
                                        "S3CanonicalUserId"
                                    ),
                                },
                                Action: ["s3:GetObject", "s3:ListBucket"],
                                Resource: [
                                    this.fnGetAtt(
                                        this.bucketResourceName,
                                        "Arn"
                                    ),
                                    this.fnJoin("", [
                                        this.fnGetAtt(
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
                            DomainName: this.fnGetAtt(
                                this.bucketResourceName,
                                "RegionalDomainName"
                            ),
                            S3OriginConfig: {
                                OriginAccessIdentity: this.fnJoin("", [
                                    "origin-access-identity/cloudfront/",
                                    this.fnRef(originAccessIdentityResourceId),
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
