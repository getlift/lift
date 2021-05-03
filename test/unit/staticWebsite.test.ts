import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("static website", () => {
    it("should create all required resources", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
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
            "staticwebsitelandingCDNCFDistributionE1B79734",
        ]);
        expect(cfTemplate.Resources[computeLogicalId("static-website", "landing", "Bucket")]).toMatchObject({
            Type: "AWS::S3::Bucket",
            UpdateReplacePolicy: "Delete",
            DeletionPolicy: "Delete",
        });
        expect(cfTemplate.Resources[computeLogicalId("static-website", "landing", "Bucket", "Policy")]).toMatchObject({
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
        expect(
            cfTemplate.Resources[computeLogicalId("static-website", "landing", "OriginAccessIdentity")]
        ).toMatchObject({
            Type: "AWS::CloudFront::CloudFrontOriginAccessIdentity",
            Properties: {
                CloudFrontOriginAccessIdentityConfig: {
                    Comment: "Identity that represents CloudFront for the landing static website.",
                },
            },
        });
        expect(
            cfTemplate.Resources[computeLogicalId("static-website", "landing", "CDN", "CFDistribution")]
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
            [computeLogicalId("static-website", "landing", "BucketName")]: {
                Description: "Name of the bucket that stores the static website.",
                Value: {
                    Ref: "staticwebsitelandingBucket2D9A4B68",
                },
            },
            [computeLogicalId("static-website", "landing", "Domain")]: {
                Description: "Website domain name.",
                Value: {
                    "Fn::GetAtt": ["staticwebsitelandingCDNCFDistributionE1B79734", "DomainName"],
                },
            },
            [computeLogicalId("static-website", "landing", "CloudFrontCName")]: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": ["staticwebsitelandingCDNCFDistributionE1B79734", "DomainName"],
                },
            },
            [computeLogicalId("static-website", "landing", "DistributionId")]: {
                Description: "ID of the CloudFront distribution.",
                Value: {
                    Ref: "staticwebsitelandingCDNCFDistributionE1B79734",
                },
            },
        });
    });

    it("should support custom domains", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "staticWebsiteDomain",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        // Check that CloudFront uses the custom ACM certificate and custom domain
        expect(
            cfTemplate.Resources[computeLogicalId("static-website", "landing", "CDN", "CFDistribution")]
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
            [computeLogicalId("static-website", "landing", "Domain")]: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            [computeLogicalId("static-website", "landing", "CloudFrontCName")]: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": ["staticwebsitelandingCDNCFDistributionE1B79734", "DomainName"],
                },
            },
        });
    });

    it("should support multiple custom domains", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "staticWebsiteDomains",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        // Check that CloudFront uses all the custom domains
        expect(
            cfTemplate.Resources[computeLogicalId("static-website", "landing", "CDN", "CFDistribution")]
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
            [computeLogicalId("static-website", "landing", "Domain")]: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            [computeLogicalId("static-website", "landing", "CloudFrontCName")]: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": ["staticwebsitelandingCDNCFDistributionE1B79734", "DomainName"],
                },
            },
        });
    });
});
