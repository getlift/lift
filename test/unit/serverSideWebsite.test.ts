import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { S3Client } from "@aws-sdk/client-s3";
import { Stack } from "aws-cdk-lib";
import { merge } from "lodash";
import type { AwsProvider } from "../../src/providers";
import { ServerSideWebsite } from "../../src/constructs/aws/ServerSideWebsite";
import { baseConfig, pluginConfigExt, runServerless } from "../utils/runServerless";
import * as CloudFormationHelpers from "../../src/CloudFormation";
import { computeS3ETag } from "../../src/utils/s3-sync";
import { mockAws } from "../utils/mockAws";

const serverSideWebsiteFixturePath = path.join(__dirname, "../fixtures/serverSideWebsite");

function createServerSideWebsite({
    getStackOutput = sinon.stub().resolves("bucket-name"),
}: {
    getStackOutput?: sinon.SinonStub;
} = {}): ServerSideWebsite {
    const provider = {
        stackName: "app-dev",
        region: "us-east-1",
        naming: {
            getHttpApiLogicalId: () => "HttpApi",
            getRestApiLogicalId: () => "ApiGatewayRestApi",
        },
        getStage: () => undefined,
        getStackOutput,
        getS3Client: () => Promise.resolve(new S3Client({ region: "us-east-1" })),
        getCloudFrontClient: () => Promise.resolve(new CloudFrontClient({ region: "us-east-1" })),
    } as unknown as AwsProvider;

    return new ServerSideWebsite(
        new Stack(),
        "backend",
        {
            type: "server-side-website",
            versionedAssets: true,
            assets: {
                "/assets/*": path.join(serverSideWebsiteFixturePath, "public"),
            },
            errorPage: path.join(serverSideWebsiteFixturePath, "error.html"),
        },
        provider
    );
}

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
        const originAccessControlLogicalId = computeLogicalId("backend", "S3OriginAccessControl");
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        const cfOriginId1 = computeLogicalId("backend", "CDN", "Origin1");
        const cfOriginId2 = computeLogicalId("backend", "CDN", "Origin2");
        const requestFunction = computeLogicalId("backend", "RequestFunction");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketLogicalId,
            bucketPolicyLogicalId,
            requestFunction,
            originAccessControlLogicalId,
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
                                Service: "cloudfront.amazonaws.com",
                            },
                            Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/*"]] },
                            Condition: {
                                StringEquals: {
                                    "AWS:SourceArn": {
                                        "Fn::Join": [
                                            "",
                                            [
                                                "arn:",
                                                { Ref: "AWS::Partition" },
                                                ":cloudfront::",
                                                { Ref: "AWS::AccountId" },
                                                ":distribution/",
                                                { Ref: cfDistributionLogicalId },
                                            ],
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                    Version: "2012-10-17",
                },
            },
        });
        expect(cfTemplate.Resources[originAccessControlLogicalId]).toMatchObject({
            Type: "AWS::CloudFront::OriginAccessControl",
            Properties: {
                OriginAccessControlConfig: {
                    // Name includes stack name to avoid collisions when deploying multiple stages
                    Name: "app-dev-backend-oac",
                    OriginAccessControlOriginType: "s3",
                    SigningBehavior: "always",
                    SigningProtocol: "sigv4",
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
                            OriginAccessControlId: { "Fn::GetAtt": [originAccessControlLogicalId, "Id"] },
                            S3OriginConfig: {
                                OriginAccessIdentity: "",
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

    it("should add an obsolete asset lifecycle rule when versioned assets are enabled", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        versionedAssets: true,
                        assets: {
                            "/assets/*": "public",
                        },
                    },
                },
            }),
        });

        expect(cfTemplate.Resources[computeLogicalId("backend", "Assets")]).toMatchObject({
            Properties: {
                LifecycleConfiguration: {
                    Rules: [
                        {
                            ExpirationInDays: 1,
                            Status: "Enabled",
                            TagFilters: [{ Key: "Obsolete", Value: "true" }],
                        },
                    ],
                },
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
        }).rejects.toThrow(
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
        }).rejects.toThrow(
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
        expect(putObjectSpy.getCalls().map((call) => call.firstArg as unknown)).toEqual(
            expect.arrayContaining([
                {
                    Bucket: "bucket-name",
                    Key: "assets/scripts.js",
                    Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/scripts.js")),
                    ContentType: "text/javascript",
                },
                {
                    Bucket: "bucket-name",
                    Key: "assets/styles.css",
                    Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/styles.css")),
                    ContentType: "text/css",
                },
                {
                    Bucket: "bucket-name",
                    Key: "error.html",
                    Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/error.html")),
                    ContentType: "text/html",
                },
            ])
        );
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

    it("should tag obsolete assets instead of deleting them when versioned assets are enabled", async () => {
        const awsMock = mockAws();
        sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("bucket-name");
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
        const deleteObjectsSpy = awsMock.mockService("S3", "deleteObjects");
        const getObjectTaggingSpy = awsMock.mockService("S3", "getObjectTagging").callsFake((params) => {
            const key = (params as { Key: string }).Key;
            if (key === "assets/logo.png") {
                return Promise.resolve({
                    TagSet: [
                        { Key: "Cache", Value: "forever" },
                        { Key: "Obsolete", Value: "true" },
                    ],
                });
            }

            return Promise.resolve({ TagSet: [] });
        });
        const putObjectTaggingSpy = awsMock.mockService("S3", "putObjectTagging").resolves({});
        awsMock.mockService("S3", "headObject").resolves({
            ContentType: "image/jpeg",
            Metadata: { cache: "forever" },
        });
        const copyObjectSpy = awsMock.mockService("S3", "copyObject").resolves({});
        const cloudfrontInvalidationSpy = awsMock.mockService("CloudFront", "createInvalidation");

        await runServerless({
            fixture: "serverSideWebsite",
            configExt: merge({}, pluginConfigExt, {
                constructs: {
                    backend: {
                        versionedAssets: true,
                    },
                },
            }),
            command: "backend:assets:upload",
        });

        sinon.assert.callCount(putObjectSpy, 3);
        sinon.assert.notCalled(deleteObjectsSpy);
        expect(getObjectTaggingSpy.getCalls().map((call) => call.firstArg as unknown)).toEqual(
            expect.arrayContaining([
                {
                    Bucket: "bucket-name",
                    Key: "assets/logo.png",
                },
                {
                    Bucket: "bucket-name",
                    Key: "assets/image.jpg",
                },
            ])
        );
        // logo.png is a current file: its Obsolete tag is removed via PutObjectTagging (restore path).
        expect(putObjectTaggingSpy.getCalls().map((call) => call.firstArg as unknown)).toEqual([
            {
                Bucket: "bucket-name",
                Key: "assets/logo.png",
                Tagging: {
                    TagSet: [{ Key: "Cache", Value: "forever" }],
                },
            },
        ]);
        // image.jpg is obsolete: it is tagged through an in-place copy (sets the tag and resets
        // the lifecycle expiry in a single call).
        sinon.assert.calledOnce(copyObjectSpy);
        expect(copyObjectSpy.firstCall.firstArg).toMatchObject({
            Bucket: "bucket-name",
            Key: "assets/image.jpg",
            CopySource: "bucket-name/assets/image.jpg",
            MetadataDirective: "REPLACE",
            Metadata: {
                cache: "forever",
            },
            ContentType: "image/jpeg",
            TaggingDirective: "REPLACE",
            Tagging: "Obsolete=true",
        });
        const copyObjectMetadata = (copyObjectSpy.firstCall.firstArg as { Metadata: Record<string, string> }).Metadata;
        expect(typeof copyObjectMetadata["lift-obsolete-at"]).toBe("string");
        sinon.assert.calledOnce(cloudfrontInvalidationSpy);
    });

    it("should pre-upload new versioned assets and sync changed assets after deploy", async () => {
        const awsMock = mockAws();
        const website = createServerSideWebsite();
        const listObjectsV2Spy = awsMock.mockService("S3", "listObjectsV2");
        listObjectsV2Spy.onFirstCall().resolves({
            IsTruncated: false,
            Contents: [
                {
                    Key: "assets/logo.png",
                    ETag: computeS3ETag(fs.readFileSync(path.join(serverSideWebsiteFixturePath, "public/logo.png"))),
                },
                { Key: "assets/styles.css" },
                { Key: "assets/image.jpg" },
            ],
        });
        listObjectsV2Spy.onSecondCall().resolves({
            IsTruncated: false,
            Contents: [
                {
                    Key: "assets/logo.png",
                    ETag: computeS3ETag(fs.readFileSync(path.join(serverSideWebsiteFixturePath, "public/logo.png"))),
                },
                {
                    Key: "assets/scripts.js",
                    ETag: computeS3ETag(fs.readFileSync(path.join(serverSideWebsiteFixturePath, "public/scripts.js"))),
                },
                { Key: "assets/styles.css" },
                { Key: "assets/image.jpg" },
            ],
        });
        const putObjectSpy = awsMock.mockService("S3", "putObject");
        awsMock.mockService("S3", "headObject").resolves({
            ETag: computeS3ETag(fs.readFileSync(path.join(serverSideWebsiteFixturePath, "error.html"))),
        });
        const deleteObjectsSpy = awsMock.mockService("S3", "deleteObjects");
        const getObjectTaggingSpy = awsMock.mockService("S3", "getObjectTagging").resolves({ TagSet: [] });
        const putObjectTaggingSpy = awsMock.mockService("S3", "putObjectTagging").resolves({});
        const copyObjectSpy = awsMock.mockService("S3", "copyObject").resolves({});
        const cloudfrontInvalidationSpy = awsMock.mockService("CloudFront", "createInvalidation");

        await website.preDeploy();
        const uploadCountAfterPreDeploy = putObjectSpy.callCount;

        expect(uploadCountAfterPreDeploy).toBe(1);
        expect(putObjectSpy.firstCall.firstArg).toMatchObject({
            Bucket: "bucket-name",
            Key: "assets/scripts.js",
        });
        sinon.assert.notCalled(deleteObjectsSpy);
        sinon.assert.notCalled(putObjectTaggingSpy);
        sinon.assert.notCalled(cloudfrontInvalidationSpy);

        await website.postDeploy();

        sinon.assert.callCount(putObjectSpy, uploadCountAfterPreDeploy + 1);
        expect(putObjectSpy.secondCall.firstArg).toMatchObject({
            Bucket: "bucket-name",
            Key: "assets/styles.css",
        });
        sinon.assert.notCalled(deleteObjectsSpy);
        expect(getObjectTaggingSpy.getCalls().map((call) => call.firstArg as unknown)).toEqual(
            expect.arrayContaining([
                {
                    Bucket: "bucket-name",
                    Key: "assets/logo.png",
                },
                {
                    Bucket: "bucket-name",
                    Key: "assets/image.jpg",
                },
            ])
        );
        // image.jpg is tagged obsolete through an in-place copy, not a separate PutObjectTagging call.
        sinon.assert.notCalled(putObjectTaggingSpy);
        sinon.assert.calledOnce(copyObjectSpy);
        expect(copyObjectSpy.firstCall.firstArg).toMatchObject({
            Bucket: "bucket-name",
            Key: "assets/image.jpg",
            MetadataDirective: "REPLACE",
            Metadata: {},
            TaggingDirective: "REPLACE",
            Tagging: "Obsolete=true",
        });
        const copyObjectMetadata = (copyObjectSpy.firstCall.firstArg as { Metadata: Record<string, string> }).Metadata;
        expect(typeof copyObjectMetadata["lift-obsolete-at"]).toBe("string");
        // The assets uploaded during preDeploy warrant a cache invalidation, deferred to postDeploy.
        sinon.assert.calledOnce(cloudfrontInvalidationSpy);
    });

    it("should do a full post-deploy sync when pre-deploy cannot find the assets bucket", async () => {
        const awsMock = mockAws();
        const getStackOutput = sinon.stub();
        getStackOutput.onFirstCall().resolves(undefined);
        getStackOutput.resolves("bucket-name");
        const website = createServerSideWebsite({ getStackOutput });
        awsMock.mockService("S3", "listObjectsV2").resolves({
            IsTruncated: false,
            Contents: [
                {
                    Key: "assets/logo.png",
                    ETag: computeS3ETag(fs.readFileSync(path.join(serverSideWebsiteFixturePath, "public/logo.png"))),
                },
                { Key: "assets/styles.css" },
                { Key: "assets/image.jpg" },
            ],
        });
        const putObjectSpy = awsMock.mockService("S3", "putObject");
        awsMock.mockService("S3", "headObject").resolves({
            ETag: computeS3ETag(fs.readFileSync(path.join(serverSideWebsiteFixturePath, "error.html"))),
        });
        const deleteObjectsSpy = awsMock.mockService("S3", "deleteObjects");
        const putObjectTaggingSpy = awsMock.mockService("S3", "putObjectTagging").resolves({});
        const copyObjectSpy = awsMock.mockService("S3", "copyObject").resolves({});
        awsMock.mockService("S3", "getObjectTagging").resolves({ TagSet: [] });
        const cloudfrontInvalidationSpy = awsMock.mockService("CloudFront", "createInvalidation");

        await website.preDeploy();

        sinon.assert.notCalled(putObjectSpy);
        sinon.assert.notCalled(putObjectTaggingSpy);

        await website.postDeploy();

        sinon.assert.callCount(putObjectSpy, 2);
        sinon.assert.notCalled(deleteObjectsSpy);
        // image.jpg is tagged obsolete through an in-place copy, not a separate PutObjectTagging call.
        sinon.assert.notCalled(putObjectTaggingSpy);
        sinon.assert.calledOnce(copyObjectSpy);
        expect(copyObjectSpy.firstCall.firstArg).toMatchObject({
            Bucket: "bucket-name",
            Key: "assets/image.jpg",
            MetadataDirective: "REPLACE",
            Metadata: {},
            TaggingDirective: "REPLACE",
            Tagging: "Obsolete=true",
        });
        const copyObjectMetadata = (copyObjectSpy.firstCall.firstArg as { Metadata: Record<string, string> }).Metadata;
        expect(typeof copyObjectMetadata["lift-obsolete-at"]).toBe("string");
        // The assets uploaded during the full post-deploy sync warrant a cache invalidation.
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

    it("should treat empty string domain and certificate as unconfigured", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        domain: "",
                        certificate: "",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        // No Aliases or ViewerCertificate should be set
        expect(cfTemplate.Resources[cfDistributionLogicalId]).not.toHaveProperty(
            "Properties.DistributionConfig.Aliases"
        );
        expect(cfTemplate.Resources[cfDistributionLogicalId]).not.toHaveProperty(
            "Properties.DistributionConfig.ViewerCertificate"
        );
        // The domain output should fall back to the CloudFront domain
        expect(cfTemplate.Outputs).toMatchObject({
            [computeLogicalId("backend", "Domain")]: {
                Description: "Website domain name.",
                Value: { "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"] },
            },
        });
    });

    it("should treat empty string domain with valid certificate as unconfigured", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        domain: "",
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        // No Aliases should be set (domain is empty)
        expect(cfTemplate.Resources[cfDistributionLogicalId]).not.toHaveProperty(
            "Properties.DistributionConfig.Aliases"
        );
    });

    it("should treat empty array domain as unconfigured", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        domain: [],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        // No Aliases should be set (domain is empty array)
        expect(cfTemplate.Resources[cfDistributionLogicalId]).not.toHaveProperty(
            "Properties.DistributionConfig.Aliases"
        );
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
