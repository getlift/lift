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
            "staticwebsitelandingBucket2D9A4B68",
            "staticwebsitelandingBucketPolicy0949F05B",
            "staticwebsitelandingOriginAccessIdentityF09189E5",
            "staticwebsitelandingBucketPolicyEE429D75",
            "staticwebsitelandingCDNCFDistributionE1B79734",
        ]);
        expect(cfTemplate.Resources.staticwebsitelandingBucket2D9A4B68).toMatchObject({
            Type: "AWS::S3::Bucket",
            UpdateReplacePolicy: "Delete",
            DeletionPolicy: "Delete",
        });
        expect(cfTemplate.Resources.staticwebsitelandingBucketPolicy0949F05B).toMatchObject({
            Properties: {
                Bucket: {
                    Ref: "staticwebsitelandingBucket2D9A4B68",
                },
                PolicyDocument: {
                    Statement: [
                        {
                            Action: "s3:GetObject",
                            Effect: "Allow",
                            Principal: {
                                CanonicalUser: {
                                    "Fn::GetAtt": [
                                        "staticwebsitelandingOriginAccessIdentityF09189E5",
                                        "S3CanonicalUserId",
                                    ],
                                },
                            },
                            Resource: {
                                "Fn::Join": [
                                    "",
                                    [
                                        {
                                            "Fn::GetAtt": ["staticwebsitelandingBucket2D9A4B68", "Arn"],
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
        expect(cfTemplate.Resources.staticwebsitelandingOriginAccessIdentityF09189E5).toMatchObject({
            Type: "AWS::CloudFront::CloudFrontOriginAccessIdentity",
            Properties: {
                CloudFrontOriginAccessIdentityConfig: {
                    Comment: "OAI for landing static website.",
                },
            },
        });
        expect(cfTemplate.Resources.staticwebsitelandingBucketPolicyEE429D75).toMatchObject({
            Type: "AWS::S3::BucketPolicy",
            Properties: {
                Bucket: {
                    Ref: "staticwebsitelandingBucket2D9A4B68",
                },
                PolicyDocument: {
                    Statement: [
                        {
                            Action: ["s3:GetObject", "s3:ListBucket"],
                            Effect: "Allow",
                            Principal: {
                                CanonicalUser: {
                                    "Fn::GetAtt": [
                                        "staticwebsitelandingOriginAccessIdentityF09189E5",
                                        "S3CanonicalUserId",
                                    ],
                                },
                            },
                            Resource: [
                                {
                                    "Fn::GetAtt": ["staticwebsitelandingBucket2D9A4B68", "Arn"],
                                },
                                {
                                    "Fn::Join": [
                                        "",
                                        [
                                            {
                                                "Fn::GetAtt": ["staticwebsitelandingBucket2D9A4B68", "Arn"],
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
        expect(cfTemplate.Resources.staticwebsitelandingCDNCFDistributionE1B79734).toMatchObject({
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
                                "Fn::GetAtt": ["staticwebsitelandingBucket2D9A4B68", "RegionalDomainName"],
                            },
                            Id: "origin1",
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        [
                                            "origin-access-identity/cloudfront/",
                                            {
                                                Ref: "staticwebsitelandingOriginAccessIdentityF09189E5",
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
            staticwebsitelandingBucketNameD7BAF2DC: {
                Description: "Name of the bucket that stores the static website.",
                Value: {
                    Ref: "staticwebsitelandingBucket2D9A4B68",
                },
            },
            staticwebsitelandingDomain28425DC9: {
                Description: "Website domain name.",
                Value: {
                    "Fn::GetAtt": ["staticwebsitelandingCDNCFDistributionE1B79734", "DomainName"],
                },
            },
            staticwebsitelandingCloudFrontCName4703AED9: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": ["staticwebsitelandingCDNCFDistributionE1B79734", "DomainName"],
                },
            },
            staticwebsitelandingDistributionId09E6715C: {
                Description: "ID of the CloudFront distribution.",
                Value: {
                    Ref: "staticwebsitelandingCDNCFDistributionE1B79734",
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
        expect(cfTemplate.Resources.staticwebsitelandingCDNCFDistributionE1B79734).toMatchObject({
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
            staticwebsitelandingDomain28425DC9: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            staticwebsitelandingCloudFrontCName4703AED9: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": ["staticwebsitelandingCDNCFDistributionE1B79734", "DomainName"],
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
        expect(cfTemplate.Resources.staticwebsitelandingCDNCFDistributionE1B79734).toMatchObject({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Aliases: ["example.com", "www.example.com"],
                },
            },
        });
        // This should contain the first domain of the list
        expect(cfTemplate.Outputs).toMatchObject({
            staticwebsitelandingDomain28425DC9: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            staticwebsitelandingCloudFrontCName4703AED9: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": ["staticwebsitelandingCDNCFDistributionE1B79734", "DomainName"],
                },
            },
        });
    });
});
