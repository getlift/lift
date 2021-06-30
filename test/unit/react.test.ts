import * as sinon from "sinon";
import { baseConfig, runServerless } from "../utils/runServerless";

describe("react", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("should create all required resources", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "react-website",
                    },
                },
            }),
        });
        const bucketLogicalId = computeLogicalId("landing", "Bucket");
        const bucketPolicyLogicalId = computeLogicalId("landing", "Bucket", "Policy");
        const originAccessIdentityLogicalId = computeLogicalId("landing", "OriginAccessIdentity");
        const requestFunction = computeLogicalId("landing", "RequestFunction");
        const responseFunction = computeLogicalId("landing", "ResponseFunction");
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
        const cfOriginId = computeLogicalId("landing", "CDN", "Origin1");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketLogicalId,
            bucketPolicyLogicalId,
            originAccessIdentityLogicalId,
            requestFunction,
            responseFunction,
            cfDistributionLogicalId,
        ]);
        expect(cfTemplate.Resources[bucketLogicalId]).toMatchObject({
            Type: "AWS::S3::Bucket",
            UpdateReplacePolicy: "Delete",
            DeletionPolicy: "Delete",
        });
        expect(cfTemplate.Resources[bucketPolicyLogicalId]).toMatchObject({
            Properties: {
                Bucket: {
                    Ref: bucketLogicalId,
                },
                PolicyDocument: {
                    Statement: [
                        {
                            Action: ["s3:GetObject*", "s3:GetBucket*", "s3:List*"],
                            Effect: "Allow",
                            Principal: {
                                CanonicalUser: {
                                    "Fn::GetAtt": [originAccessIdentityLogicalId, "S3CanonicalUserId"],
                                },
                            },
                            Resource: [
                                {
                                    "Fn::GetAtt": [bucketLogicalId, "Arn"],
                                },
                                {
                                    "Fn::Join": [
                                        "",
                                        [
                                            {
                                                "Fn::GetAtt": [bucketLogicalId, "Arn"],
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
        expect(cfTemplate.Resources[originAccessIdentityLogicalId]).toMatchObject({
            Type: "AWS::CloudFront::CloudFrontOriginAccessIdentity",
            Properties: {
                CloudFrontOriginAccessIdentityConfig: {
                    Comment: "Identity that represents CloudFront for the landing static website.",
                },
            },
        });
        expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
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
                        Compress: true,
                        TargetOriginId: cfOriginId,
                        ViewerProtocolPolicy: "redirect-to-https",
                        FunctionAssociations: [
                            {
                                EventType: "viewer-request",
                                FunctionARN: {
                                    "Fn::GetAtt": [requestFunction, "FunctionARN"],
                                },
                            },
                            {
                                EventType: "viewer-response",
                                FunctionARN: {
                                    "Fn::GetAtt": [responseFunction, "FunctionARN"],
                                },
                            },
                        ],
                    },
                    DefaultRootObject: "index.html",
                    Enabled: true,
                    HttpVersion: "http2",
                    IPV6Enabled: true,
                    Origins: [
                        {
                            DomainName: {
                                "Fn::GetAtt": [bucketLogicalId, "RegionalDomainName"],
                            },
                            Id: cfOriginId,
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        [
                                            "origin-access-identity/cloudfront/",
                                            {
                                                Ref: originAccessIdentityLogicalId,
                                            },
                                        ],
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        });
        expect(cfTemplate.Outputs).toMatchObject({
            [computeLogicalId("landing", "BucketName")]: {
                Description: "Name of the bucket that stores the static website.",
                Value: {
                    Ref: bucketLogicalId,
                },
            },
            [computeLogicalId("landing", "Domain")]: {
                Description: "Website domain name.",
                Value: {
                    "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"],
                },
            },
            [computeLogicalId("landing", "CloudFrontCName")]: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"],
                },
            },
            [computeLogicalId("landing", "DistributionId")]: {
                Description: "ID of the CloudFront distribution.",
                Value: {
                    Ref: cfDistributionLogicalId,
                },
            },
        });
        expect(cfTemplate.Resources[responseFunction]).toMatchObject({
            Type: "AWS::CloudFront::Function",
            Properties: {
                AutoPublish: true,
                FunctionConfig: {
                    Comment: "app-dev-us-east-1-landing-response",
                    Runtime: "cloudfront-js-1.0",
                },
                Name: "app-dev-us-east-1-landing-response",
            },
        });
    });

    it("should support a custom domain", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "react-website",
                        domain: "example.com",
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
        // Check that CloudFront uses the custom ACM certificate and custom domain
        expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Aliases: ["example.com"],
                    ViewerCertificate: {
                        AcmCertificateArn:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                        MinimumProtocolVersion: "TLSv1.2_2019",
                        SslSupportMethod: "sni-only",
                    },
                },
            },
        });
        // The domain should be the custom domain, not the CloudFront one
        expect(cfTemplate.Outputs).toMatchObject({
            [computeLogicalId("landing", "Domain")]: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            [computeLogicalId("landing", "CloudFrontCName")]: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"],
                },
            },
        });
    });

    it("should support multiple custom domains", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "react-website",
                        domain: ["example.com", "www.example.com"],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
        // Check that CloudFront uses all the custom domains
        expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Aliases: ["example.com", "www.example.com"],
                },
            },
        });
        // This should contain the first domain of the list
        expect(cfTemplate.Outputs).toMatchObject({
            [computeLogicalId("landing", "Domain")]: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            [computeLogicalId("landing", "CloudFrontCName")]: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"],
                },
            },
        });
    });

    it("should allow to customize security HTTP headers", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "react-website",
                        security: {
                            allowIframe: true,
                        },
                    },
                },
            }),
        });
        const edgeFunction = computeLogicalId("landing", "ResponseFunction");
        expect(cfTemplate.Resources[edgeFunction]).toMatchObject({
            Type: "AWS::CloudFront::Function",
            Properties: {
                // Check that the `x-frame-options` header is not set
                FunctionCode: `function handler(event) {
    var response = event.response;
    response.headers = Object.assign({}, {
    "x-content-type-options": {
        "value": "nosniff"
    },
    "x-xss-protection": {
        "value": "1; mode=block"
    },
    "strict-transport-security": {
        "value": "max-age=63072000"
    }
}, response.headers);
    return response;
}`,
            },
        });
    });
});
