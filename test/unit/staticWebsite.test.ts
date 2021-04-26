import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("static website", () => {
    it("should create all required resources", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "staticWebsite",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            "LandingWebsiteBucketD7903DC3",
            "LandingWebsiteBucketPolicyBD4D4492",
            "LandingWebsiteOriginAccessIdentity7F379C01",
            "LandingWebsiteBucketPolicy383713E2",
            "LandingWebsiteCDNCFDistribution8079F676",
        ]);
        expect(cfTemplate.Resources.LandingWebsiteBucketD7903DC3).toMatchObject(
            {
                Type: "AWS::S3::Bucket",
                UpdateReplacePolicy: "Delete",
                DeletionPolicy: "Delete",
            }
        );
        expect(
            cfTemplate.Resources.LandingWebsiteBucketPolicyBD4D4492
        ).toMatchObject({
            Properties: {
                Bucket: {
                    Ref: "LandingWebsiteBucketD7903DC3",
                },
                PolicyDocument: {
                    Statement: [
                        {
                            Action: "s3:GetObject",
                            Effect: "Allow",
                            Principal: {
                                CanonicalUser: {
                                    "Fn::GetAtt": [
                                        "LandingWebsiteOriginAccessIdentity7F379C01",
                                        "S3CanonicalUserId",
                                    ],
                                },
                            },
                            Resource: {
                                "Fn::Join": [
                                    "",
                                    [
                                        {
                                            "Fn::GetAtt": [
                                                "LandingWebsiteBucketD7903DC3",
                                                "Arn",
                                            ],
                                        },
                                        "/*",
                                    ],
                                ],
                            },
                        },
                    ],
                    Version: "2012-10-17",
                },
            },
        });
        expect(
            cfTemplate.Resources.LandingWebsiteOriginAccessIdentity7F379C01
        ).toMatchObject({
            Type: "AWS::CloudFront::CloudFrontOriginAccessIdentity",
            Properties: {
                CloudFrontOriginAccessIdentityConfig: {
                    Comment: "OAI for landing static website.",
                },
            },
        });
        expect(
            cfTemplate.Resources.LandingWebsiteBucketPolicy383713E2
        ).toMatchObject({
            Type: "AWS::S3::BucketPolicy",
            Properties: {
                Bucket: {
                    Ref: "LandingWebsiteBucketD7903DC3",
                },
                PolicyDocument: {
                    Statement: [
                        {
                            Action: ["s3:GetObject", "s3:ListBucket"],
                            Effect: "Allow",
                            Principal: {
                                CanonicalUser: {
                                    "Fn::GetAtt": [
                                        "LandingWebsiteOriginAccessIdentity7F379C01",
                                        "S3CanonicalUserId",
                                    ],
                                },
                            },
                            Resource: [
                                {
                                    "Fn::GetAtt": [
                                        "LandingWebsiteBucketD7903DC3",
                                        "Arn",
                                    ],
                                },
                                {
                                    "Fn::Join": [
                                        "",
                                        [
                                            {
                                                "Fn::GetAtt": [
                                                    "LandingWebsiteBucketD7903DC3",
                                                    "Arn",
                                                ],
                                            },
                                            "/*",
                                        ],
                                    ],
                                },
                            ],
                        },
                    ],
                    Version: "2012-10-17",
                },
            },
        });
        expect(
            cfTemplate.Resources.LandingWebsiteCDNCFDistribution8079F676
        ).toMatchObject({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    CustomErrorResponses: [
                        {
                            ErrorCachingMinTTL: 0,
                            ErrorCode: 404,
                            ResponseCode: 200,
                            ResponsePagePath: "/index.html",
                        },
                    ],
                    DefaultCacheBehavior: {
                        AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                        CachedMethods: ["GET", "HEAD", "OPTIONS"],
                        Compress: true,
                        DefaultTTL: 3600,
                        ForwardedValues: {
                            Cookies: {
                                Forward: "none",
                            },
                            QueryString: false,
                        },
                        TargetOriginId: "origin1",
                        ViewerProtocolPolicy: "redirect-to-https",
                    },
                    DefaultRootObject: "index.html",
                    Enabled: true,
                    HttpVersion: "http2",
                    IPV6Enabled: true,
                    Origins: [
                        {
                            ConnectionAttempts: 3,
                            ConnectionTimeout: 10,
                            DomainName: {
                                "Fn::GetAtt": [
                                    "LandingWebsiteBucketD7903DC3",
                                    "RegionalDomainName",
                                ],
                            },
                            Id: "origin1",
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        [
                                            "origin-access-identity/cloudfront/",
                                            {
                                                Ref:
                                                    "LandingWebsiteOriginAccessIdentity7F379C01",
                                            },
                                        ],
                                    ],
                                },
                            },
                        },
                    ],
                    PriceClass: "PriceClass_100",
                    ViewerCertificate: {
                        CloudFrontDefaultCertificate: true,
                    },
                },
            },
        });
        expect(cfTemplate.Outputs).toMatchObject({
            LandingWebsiteBucketName: {
                Description:
                    "Name of the bucket that stores the static website.",
                Value: {
                    Ref: "LandingWebsiteBucketD7903DC3",
                },
            },
            LandingWebsiteDomain: {
                Description: "Website domain name.",
                Value: {
                    "Fn::GetAtt": [
                        "LandingWebsiteCDNCFDistribution8079F676",
                        "DomainName",
                    ],
                },
            },
            LandingWebsiteCloudFrontDomain: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": [
                        "LandingWebsiteCDNCFDistribution8079F676",
                        "DomainName",
                    ],
                },
            },
            LandingWebsiteDistributionId: {
                Description: "ID of the CloudFront distribution.",
                Value: {
                    Ref: "LandingWebsiteCDNCFDistribution8079F676",
                },
            },
        });
    });

    it("should support custom domains", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "staticWebsiteDomain",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        // Check that CloudFront uses the custom ACM certificate and custom domain
        expect(
            cfTemplate.Resources.LandingWebsiteCDNCFDistribution8079F676
        ).toMatchObject({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Aliases: ["example.com"],
                    ViewerCertificate: {
                        AcmCertificateArn:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                        MinimumProtocolVersion: "TLSv1.1_2016",
                        SslSupportMethod: "sni-only",
                    },
                },
            },
        });
        // The domain should be the custom domain, not the CloudFront one
        expect(cfTemplate.Outputs).toMatchObject({
            LandingWebsiteDomain: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            LandingWebsiteCloudFrontDomain: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": [
                        "LandingWebsiteCDNCFDistribution8079F676",
                        "DomainName",
                    ],
                },
            },
        });
    });

    it("should support multiple custom domains", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "staticWebsiteDomains",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        // Check that CloudFront uses all the custom domains
        expect(
            cfTemplate.Resources.LandingWebsiteCDNCFDistribution8079F676
        ).toMatchObject({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Aliases: ["example.com", "www.example.com"],
                },
            },
        });
        // This should contain the first domain of the list
        expect(cfTemplate.Outputs).toMatchObject({
            LandingWebsiteDomain: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            LandingWebsiteCloudFrontDomain: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": [
                        "LandingWebsiteCDNCFDistribution8079F676",
                        "DomainName",
                    ],
                },
            },
        });
    });
});
