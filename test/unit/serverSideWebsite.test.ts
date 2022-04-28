import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import { baseConfig, pluginConfigExt, runServerless } from "../utils/runServerless";
import * as CloudFormationHelpers from "../../src/CloudFormation";
import { computeS3ETag } from "../../src/utils/s3-sync";
import { mockAws } from "../utils/mockAws";

describe("server-side website", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("should create all required resources", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        assets: {
                            "/assets/*": "public",
                        },
                    },
                },
            }),
        });
        const bucketLogicalId = computeLogicalId("backend", "Assets");
        const bucketPolicyLogicalId = computeLogicalId("backend", "Assets", "Policy");
        const originAccessIdentityLogicalId = computeLogicalId("backend", "CDN", "Origin2", "S3Origin");
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        const cfOriginId1 = computeLogicalId("backend", "CDN", "Origin1");
        const cfOriginId2 = computeLogicalId("backend", "CDN", "Origin2");
        const originPolicyId = computeLogicalId("backend", "BackendOriginPolicy");
        const cachePolicyId = computeLogicalId("backend", "BackendCachePolicy");
        const requestFunction = computeLogicalId("backend", "RequestFunction");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketLogicalId,
            bucketPolicyLogicalId,
            originPolicyId,
            cachePolicyId,
            requestFunction,
            originAccessIdentityLogicalId,
            cfDistributionLogicalId,
        ]);
        expect(cfTemplate.Resources[bucketLogicalId]).toMatchObject({
            Type: "AWS::S3::Bucket",
            UpdateReplacePolicy: "Delete",
            DeletionPolicy: "Delete",
        });
        expect(cfTemplate.Resources[bucketPolicyLogicalId]).toMatchObject({
            Properties: {
                Bucket: { Ref: bucketLogicalId },
                PolicyDocument: {
                    Statement: [
                        {
                            Action: "s3:GetObject",
                            Effect: "Allow",
                            Principal: {
                                CanonicalUser: { "Fn::GetAtt": [originAccessIdentityLogicalId, "S3CanonicalUserId"] },
                            },
                            Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/*"]] },
                        },
                    ],
                    Version: "2012-10-17",
                },
            },
        });
        expect(cfTemplate.Resources[originAccessIdentityLogicalId]).toStrictEqual({
            Type: "AWS::CloudFront::CloudFrontOriginAccessIdentity",
            Properties: {
                CloudFrontOriginAccessIdentityConfig: {
                    Comment: `Identity for ${cfOriginId2}`,
                },
            },
        });
        expect(cfTemplate.Resources[cfDistributionLogicalId]).toStrictEqual({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Comment: "app-dev backend website CDN",
                    CustomErrorResponses: [
                        { ErrorCachingMinTTL: 0, ErrorCode: 500 },
                        { ErrorCachingMinTTL: 0, ErrorCode: 504 },
                    ],
                    DefaultCacheBehavior: {
                        AllowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
                        Compress: true,
                        CachePolicyId: { Ref: cachePolicyId },
                        OriginRequestPolicyId: { Ref: originPolicyId },
                        TargetOriginId: cfOriginId1,
                        ViewerProtocolPolicy: "redirect-to-https",
                        FunctionAssociations: [
                            {
                                EventType: "viewer-request",
                                FunctionARN: {
                                    "Fn::GetAtt": [requestFunction, "FunctionARN"],
                                },
                            },
                        ],
                    },
                    CacheBehaviors: [
                        {
                            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
                            Compress: true,
                            PathPattern: "/assets/*",
                            TargetOriginId: cfOriginId2,
                            ViewerProtocolPolicy: "redirect-to-https",
                        },
                    ],
                    Enabled: true,
                    HttpVersion: "http2",
                    IPV6Enabled: true,
                    Origins: [
                        {
                            Id: cfOriginId1,
                            CustomOriginConfig: {
                                OriginProtocolPolicy: "https-only",
                                OriginSSLProtocols: ["TLSv1.2"],
                            },
                            DomainName: {
                                "Fn::Join": [".", [{ Ref: "HttpApi" }, "execute-api.us-east-1.amazonaws.com"]],
                            },
                        },
                        {
                            DomainName: { "Fn::GetAtt": [bucketLogicalId, "RegionalDomainName"] },
                            Id: cfOriginId2,
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        ["origin-access-identity/cloudfront/", { Ref: originAccessIdentityLogicalId }],
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        });
        expect(cfTemplate.Resources[originPolicyId]).toStrictEqual({
            Type: "AWS::CloudFront::OriginRequestPolicy",
            Properties: {
                OriginRequestPolicyConfig: {
                    Name: "app-dev-backend",
                    Comment: "Origin request policy for the backend website.",
                    CookiesConfig: { CookieBehavior: "all" },
                    QueryStringsConfig: { QueryStringBehavior: "all" },
                    HeadersConfig: {
                        HeaderBehavior: "whitelist",
                        Headers: [
                            "Accept",
                            "Accept-Language",
                            "Content-Type",
                            "Origin",
                            "Referer",
                            "User-Agent",
                            "X-Requested-With",
                            "X-Forwarded-Host",
                        ],
                    },
                },
            },
        });
        expect(cfTemplate.Resources[cachePolicyId]).toStrictEqual({
            Type: "AWS::CloudFront::CachePolicy",
            Properties: {
                CachePolicyConfig: {
                    Comment: "Cache policy for the backend website.",
                    DefaultTTL: 0,
                    MaxTTL: 31536000,
                    MinTTL: 0,
                    Name: "app-dev-backend",
                    ParametersInCacheKeyAndForwardedToOrigin: {
                        CookiesConfig: { CookieBehavior: "none" },
                        QueryStringsConfig: { QueryStringBehavior: "none" },
                        HeadersConfig: {
                            HeaderBehavior: "whitelist",
                            Headers: ["Authorization"],
                        },
                        EnableAcceptEncodingBrotli: false,
                        EnableAcceptEncodingGzip: false,
                    },
                },
            },
        });
        expect(cfTemplate.Outputs).toMatchObject({
            [computeLogicalId("backend", "AssetsBucketName")]: {
                Description: "Name of the bucket that stores the website assets.",
                Value: { Ref: bucketLogicalId },
            },
            [computeLogicalId("backend", "Domain")]: {
                Description: "Website domain name.",
                Value: { "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"] },
            },
            [computeLogicalId("backend", "CloudFrontCName")]: {
                Description: "CloudFront CNAME.",
                Value: { "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"] },
            },
            [computeLogicalId("backend", "DistributionId")]: {
                Description: "ID of the CloudFront distribution.",
                Value: { Ref: cfDistributionLogicalId },
            },
        });
    });

    it("assets should be optional", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                    },
                },
            }),
        });
        const bucketLogicalId = computeLogicalId("backend", "Assets");
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        const cfOriginId1 = computeLogicalId("backend", "CDN", "Origin1");
        const originPolicyId = computeLogicalId("backend", "BackendOriginPolicy");
        const cachePolicyId = computeLogicalId("backend", "BackendCachePolicy");
        const requestFunction = computeLogicalId("backend", "RequestFunction");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketLogicalId,
            originPolicyId,
            cachePolicyId,
            requestFunction,
            cfDistributionLogicalId,
        ]);
        expect(cfTemplate.Resources[cfDistributionLogicalId]).toStrictEqual({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Comment: "app-dev backend website CDN",
                    CustomErrorResponses: [
                        { ErrorCachingMinTTL: 0, ErrorCode: 500 },
                        { ErrorCachingMinTTL: 0, ErrorCode: 504 },
                    ],
                    DefaultCacheBehavior: {
                        AllowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
                        Compress: true,
                        CachePolicyId: { Ref: cachePolicyId },
                        OriginRequestPolicyId: { Ref: originPolicyId },
                        TargetOriginId: cfOriginId1,
                        ViewerProtocolPolicy: "redirect-to-https",
                        FunctionAssociations: [
                            {
                                EventType: "viewer-request",
                                FunctionARN: { "Fn::GetAtt": [requestFunction, "FunctionARN"] },
                            },
                        ],
                    },
                    Enabled: true,
                    HttpVersion: "http2",
                    IPV6Enabled: true,
                    Origins: [
                        {
                            Id: cfOriginId1,
                            CustomOriginConfig: {
                                OriginProtocolPolicy: "https-only",
                                OriginSSLProtocols: ["TLSv1.2"],
                            },
                            DomainName: {
                                "Fn::Join": [".", [{ Ref: "HttpApi" }, "execute-api.us-east-1.amazonaws.com"]],
                            },
                        },
                    ],
                },
            },
        });
    });

    it("should support REST APIs", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        apiGateway: "rest",
                    },
                },
            }),
        });
        expect(cfTemplate.Resources[computeLogicalId("backend", "CDN")]).toMatchObject({
            Properties: {
                DistributionConfig: {
                    Origins: [
                        {
                            CustomOriginConfig: {
                                OriginProtocolPolicy: "https-only",
                                OriginSSLProtocols: ["TLSv1.2"],
                            },
                            DomainName: {
                                "Fn::Join": [
                                    ".",
                                    [{ Ref: "ApiGatewayRestApi" }, "execute-api.us-east-1.amazonaws.com"],
                                ],
                            },
                        },
                    ],
                },
            },
        });
    });

    it("should support a custom domain", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        assets: {
                            "/assets/*": "public",
                        },
                        domain: "example.com",
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    // Check that CloudFront uses the custom ACM certificate and custom domain
                    Aliases: ["example.com"],
                    ViewerCertificate: {
                        AcmCertificateArn:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                        MinimumProtocolVersion: "TLSv1.2_2021",
                        SslSupportMethod: "sni-only",
                    },
                },
            },
        });
        // The domain should be the custom domain, not the CloudFront one
        expect(cfTemplate.Outputs).toMatchObject({
            [computeLogicalId("backend", "Domain")]: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            [computeLogicalId("backend", "CloudFrontCName")]: {
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
                    backend: {
                        type: "server-side-website",
                        assets: {
                            "/assets/*": "public",
                        },
                        domain: ["example.com", "www.example.com"],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
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
            [computeLogicalId("backend", "Domain")]: {
                Description: "Website domain name.",
                Value: "example.com",
            },
            [computeLogicalId("backend", "CloudFrontCName")]: {
                Description: "CloudFront CNAME.",
                Value: {
                    "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"],
                },
            },
        });
    });

    it("should allow to customize the error page", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        errorPage: "my/custom/error-page.html",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
            Properties: {
                DistributionConfig: {
                    CustomErrorResponses: [
                        {
                            ErrorCode: 500,
                            ErrorCachingMinTTL: 0,
                            ResponsePagePath: "/error-page.html",
                        },
                        {
                            ErrorCode: 504,
                            ErrorCachingMinTTL: 0,
                            ResponsePagePath: "/error-page.html",
                        },
                    ],
                },
            },
        });
    });

    it("should validate the error page path", async () => {
        await expect(() => {
            return runServerless({
                command: "package",
                config: Object.assign(baseConfig, {
                    constructs: {
                        backend: {
                            type: "server-side-website",
                            errorPage: "/error.css",
                        },
                    },
                }),
            });
        }).rejects.toThrowError(
            "Invalid configuration in 'constructs.backend.errorPage': the custom error page must be a static HTML file. '/error.css' does not end with '.html'."
        );
    });

    it("should allow to redirect to the main domain", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        domain: ["www.example.com", "example.com"],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                        redirectToMainDomain: true,
                    },
                },
            }),
        });
        const edgeFunction = computeLogicalId("backend", "RequestFunction");
        expect(cfTemplate.Resources[edgeFunction]).toMatchObject({
            Type: "AWS::CloudFront::Function",
            Properties: {
                FunctionCode: `function handler(event) {
    var request = event.request;
    request.headers["x-forwarded-host"] = request.headers["host"];
    if (request.headers["host"].value !== "www.example.com") {
        return {
            statusCode: 301,
            statusDescription: "Moved Permanently",
            headers: {
                location: {
                    value: "https://www.example.com" + request.uri
                }
            }
        };
    }
    return request;
}`,
            },
        });
    });

    it("should allow to override the forwarded headers", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        forwardedHeaders: ["X-My-Custom-Header", "X-My-Other-Custom-Header"],
                    },
                },
            }),
        });
        expect(cfTemplate.Resources[computeLogicalId("backend", "BackendOriginPolicy")]).toMatchObject({
            Properties: {
                OriginRequestPolicyConfig: {
                    HeadersConfig: {
                        HeaderBehavior: "whitelist",
                        Headers: ["X-My-Custom-Header", "X-My-Other-Custom-Header"],
                    },
                },
            },
        });
    });

    it("should not forward the Authorization header in the Origin Policy", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        forwardedHeaders: ["Authorization", "X-My-Custom-Header"],
                    },
                },
            }),
        });
        expect(cfTemplate.Resources[computeLogicalId("backend", "BackendOriginPolicy")]).toMatchObject({
            Properties: {
                OriginRequestPolicyConfig: {
                    HeadersConfig: {
                        // Should not contain "Authorization"
                        Headers: ["X-My-Custom-Header"],
                    },
                },
            },
        });
    });

    it("should forbid to force forwarding the Host header", async () => {
        await expect(() => {
            return runServerless({
                command: "package",
                config: Object.assign(baseConfig, {
                    constructs: {
                        backend: {
                            type: "server-side-website",
                            forwardedHeaders: ["Host"],
                        },
                    },
                }),
            });
        }).rejects.toThrowError(
            "Invalid value in 'constructs.backend.forwardedHeaders': the 'Host' header cannot be forwarded (this is an API Gateway limitation). Use the 'X-Forwarded-Host' header in your code instead (it contains the value of the original 'Host' header)."
        );
    });

    it("should error if more than 10 headers are configured", async () => {
        await expect(() => {
            return runServerless({
                command: "package",
                config: Object.assign(baseConfig, {
                    constructs: {
                        backend: {
                            type: "server-side-website",
                            forwardedHeaders: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
                        },
                    },
                }),
            });
        }).rejects.toThrowError(
            "Invalid value in 'constructs.backend.forwardedHeaders': 11 headers are configured but only 10 headers can be forwarded (this is an CloudFront limitation)."
        );
    });

    it("should synchronize assets to S3", async () => {
        const awsMock = mockAws();
        sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("bucket-name");
        /*
         * This scenario simulates the following:
         * - assets/logo.png is up to date, it should be ignored
         * - assets/styles.css has changes, it should be updated to S3
         * - assets/scripts.js is new, it should be created in S3
         * - assets/image.jpg doesn't exist on disk, it should be removed from S3
         */
        awsMock.mockService("S3", "listObjectsV2").resolves({
            IsTruncated: false,
            Contents: [
                {
                    Key: "assets/logo.png",
                    ETag: computeS3ETag(
                        fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/logo.png"))
                    ),
                },
                { Key: "assets/styles.css" },
                { Key: "assets/image.jpg" },
            ],
        });
        const putObjectSpy = awsMock.mockService("S3", "putObject");
        const deleteObjectsSpy = awsMock.mockService("S3", "deleteObjects").resolves({
            Deleted: [
                {
                    Key: "assets/image.jpg",
                },
            ],
        });
        const cloudfrontInvalidationSpy = awsMock.mockService("CloudFront", "createInvalidation");

        await runServerless({
            fixture: "serverSideWebsite",
            configExt: pluginConfigExt,
            command: "backend:assets:upload",
        });

        // scripts.js and styles.css were updated
        sinon.assert.callCount(putObjectSpy, 3);
        expect(putObjectSpy.firstCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Key: "assets/scripts.js",
            Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/scripts.js")),
            ContentType: "application/javascript",
        });
        expect(putObjectSpy.secondCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Key: "assets/styles.css",
            Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/styles.css")),
            ContentType: "text/css",
        });
        // It should upload the custom error page
        expect(putObjectSpy.thirdCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Key: "error.html",
            Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/error.html")),
            ContentType: "text/html",
        });
        // image.jpg was deleted
        sinon.assert.calledOnce(deleteObjectsSpy);
        expect(deleteObjectsSpy.firstCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Delete: {
                Objects: [
                    {
                        Key: "assets/image.jpg",
                    },
                ],
            },
        });
        // A CloudFront invalidation was triggered
        sinon.assert.calledOnce(cloudfrontInvalidationSpy);
    });
});
