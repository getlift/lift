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
                            "/s3-bucket/*": "s3://some-bucket",
                            "/s3-bucket-with-path/*": "s3://some-other-bucket/some-path",
                            "/s3-bucket-repeat/a/*": "s3://some-bucket-repeat",
                            "/s3-bucket-repeat/b/*": "s3://some-bucket-repeat",
                        },
                    },
                },
            }),
        });
        const bucketLogicalId = computeLogicalId("backend", "Assets");
        const bucketPolicyLogicalId = computeLogicalId("backend", "Assets", "Policy");
        const originAccessIdentityLogicalId1 = computeLogicalId("backend", "CDN", "Origin2", "S3Origin");
        const originAccessIdentityLogicalId2 = computeLogicalId("backend", "CDN", "Origin3", "S3Origin");
        const originAccessIdentityLogicalId3 = computeLogicalId("backend", "CDN", "Origin4", "S3Origin");
        const originAccessIdentityLogicalId4 = computeLogicalId("backend", "CDN", "Origin5", "S3Origin");
        const originAccessIdentityLogicalId5 = computeLogicalId("backend", "CDN", "Origin6", "S3Origin");
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        const cfOriginId1 = computeLogicalId("backend", "CDN", "Origin1");
        const cfOriginId2 = computeLogicalId("backend", "CDN", "Origin2");
        const cfOriginId3 = computeLogicalId("backend", "CDN", "Origin3");
        const cfOriginId4 = computeLogicalId("backend", "CDN", "Origin4");
        const cfOriginId5 = computeLogicalId("backend", "CDN", "Origin5");
        const cfOriginId6 = computeLogicalId("backend", "CDN", "Origin6");
        const requestFunction = computeLogicalId("backend", "RequestFunction");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketLogicalId,
            bucketPolicyLogicalId,
            requestFunction,
            originAccessIdentityLogicalId1,
            originAccessIdentityLogicalId2,
            originAccessIdentityLogicalId3,
            originAccessIdentityLogicalId4,
            originAccessIdentityLogicalId5,
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
                                CanonicalUser: { "Fn::GetAtt": [originAccessIdentityLogicalId1, "S3CanonicalUserId"] },
                            },
                            Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/*"]] },
                        },
                    ],
                    Version: "2012-10-17",
                },
            },
        });
        expect(cfTemplate.Resources[originAccessIdentityLogicalId1]).toStrictEqual({
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
                        CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
                        OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
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
                        {
                            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
                            Compress: true,
                            PathPattern: "/s3-bucket/*",
                            TargetOriginId: cfOriginId3,
                            ViewerProtocolPolicy: "redirect-to-https",
                        },
                        {
                            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
                            Compress: true,
                            PathPattern: "/s3-bucket-with-path/*",
                            TargetOriginId: cfOriginId4,
                            ViewerProtocolPolicy: "redirect-to-https",
                        },
                        {
                            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
                            Compress: true,
                            PathPattern: "/s3-bucket-repeat/a/*",
                            TargetOriginId: cfOriginId5,
                            ViewerProtocolPolicy: "redirect-to-https",
                        },
                        {
                            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
                            Compress: true,
                            PathPattern: "/s3-bucket-repeat/b/*",
                            TargetOriginId: cfOriginId6,
                            ViewerProtocolPolicy: "redirect-to-https",
                        },
                    ],
                    Enabled: true,
                    HttpVersion: "http2and3",
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
                                        ["origin-access-identity/cloudfront/", { Ref: originAccessIdentityLogicalId1 }],
                                    ],
                                },
                            },
                        },
                        {
                            DomainName: {
                                "Fn::Join": [
                                    "",
                                    ["some-bucket.s3.", { Ref: "AWS::Region" }, ".", { Ref: "AWS::URLSuffix" }],
                                ],
                            },
                            Id: cfOriginId3,
                            OriginPath: "",
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        ["origin-access-identity/cloudfront/", { Ref: originAccessIdentityLogicalId2 }],
                                    ],
                                },
                            },
                        },
                        {
                            DomainName: {
                                "Fn::Join": [
                                    "",
                                    ["some-other-bucket.s3.", { Ref: "AWS::Region" }, ".", { Ref: "AWS::URLSuffix" }],
                                ],
                            },
                            Id: cfOriginId4,
                            OriginPath: "/some-path",
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        ["origin-access-identity/cloudfront/", { Ref: originAccessIdentityLogicalId3 }],
                                    ],
                                },
                            },
                        },
                        {
                            DomainName: {
                                "Fn::Join": [
                                    "",
                                    ["some-bucket-repeat.s3.", { Ref: "AWS::Region" }, ".", { Ref: "AWS::URLSuffix" }],
                                ],
                            },
                            Id: cfOriginId5,
                            OriginPath: "",
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        ["origin-access-identity/cloudfront/", { Ref: originAccessIdentityLogicalId4 }],
                                    ],
                                },
                            },
                        },
                        {
                            DomainName: {
                                "Fn::Join": [
                                    "",
                                    ["some-bucket-repeat.s3.", { Ref: "AWS::Region" }, ".", { Ref: "AWS::URLSuffix" }],
                                ],
                            },
                            Id: cfOriginId6,
                            OriginPath: "",
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        ["origin-access-identity/cloudfront/", { Ref: originAccessIdentityLogicalId5 }],
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        });
        expect(cfTemplate.Resources[requestFunction]).toMatchObject({
            Type: "AWS::CloudFront::Function",
            Properties: {
                Name: "app-dev-us-east-1-backend-request",
                FunctionConfig: {
                    Comment: "app-dev-us-east-1-backend-request",
                    Runtime: "cloudfront-js-1.0",
                },
                AutoPublish: true,
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
        const requestFunction = computeLogicalId("backend", "RequestFunction");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketLogicalId,
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
                        CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
                        OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
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
                    HttpVersion: "http2and3",
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
                            OriginPath: "/dev",
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

    it("should validate the assets configuration", async () => {
        await expect(() => {
            return runServerless({
                command: "package",
                config: Object.assign(baseConfig, {
                    constructs: {
                        backend: {
                            type: "server-side-website",
                            assets: {
                                "/": "public",
                            },
                        },
                    },
                }),
            });
        }).rejects.toThrowError(
            "Invalid key in 'constructs.backend.assets': '/' and '/*' cannot be routed to assets because the root URL already serves the backend application running in Lambda. You must use a sub-path instead, for example '/assets/*'."
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

    it("should not error if 'forwardedHeaders' are configured", async () => {
        return runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        forwardedHeaders: ["foo", "bar"],
                    },
                },
            }),
        });
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

    it("allows overriding server side website properties", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        extensions: {
                            distribution: {
                                Properties: {
                                    DistributionConfig: {
                                        Comment: "This is my comment",
                                    },
                                },
                            },
                            bucket: {
                                Properties: {
                                    ObjectLockEnabled: true,
                                },
                            },
                        },
                    },
                },
            }),
        });
        expect(cfTemplate.Resources[computeLogicalId("backend", "CDN")].Properties).toMatchObject({
            DistributionConfig: {
                Comment: "This is my comment",
            },
        });
        expect(cfTemplate.Resources[computeLogicalId("backend", "Assets")].Properties).toMatchObject({
            ObjectLockEnabled: true,
        });
    });

    it("trims CloudFront function names to stay under the limit", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            options: {
                stage: "super-long-stage-name",
            },
            config: Object.assign(baseConfig, {
                constructs: {
                    "suuuper-long-construct-name": {
                        type: "server-side-website",
                    },
                },
            }),
        });
        expect(cfTemplate.Resources[computeLogicalId("suuuper-long-construct-name", "RequestFunction")]).toMatchObject({
            Type: "AWS::CloudFront::Function",
            Properties: {
                Name: "app-super-long-stage-name-us-east-1-suuuper-long-construc-f3b7e1",
            },
        });
    });
});
