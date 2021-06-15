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
            cliArgs: ["package"],
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        assetsPath: ".",
                    },
                },
            }),
        });
        const bucketLogicalId = computeLogicalId("backend", "Assets");
        const bucketPolicyLogicalId = computeLogicalId("backend", "Assets", "Policy");
        const originAccessIdentityLogicalId = computeLogicalId("backend", "OriginAccessIdentity");
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
        const cfOriginId1 = computeLogicalId("backend", "CDN", "Origin1");
        const cfOriginId2 = computeLogicalId("backend", "CDN", "Origin2");
        const originPolicyId = computeLogicalId("backend", "BackendOriginPolicy");
        const cachePolicyId = computeLogicalId("backend", "BackendCachePolicy");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketLogicalId,
            bucketPolicyLogicalId,
            originAccessIdentityLogicalId,
            originPolicyId,
            cachePolicyId,
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
                                    "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/*"]],
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
                    Comment: "Identity that represents CloudFront for the backend website.",
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
                    },
                    CacheBehaviors: [
                        {
                            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
                            Compress: true,
                            PathPattern: "assets/*",
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
                        Headers: ["Accept", "Accept-Language", "Origin", "Referer"],
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

    it("should support a custom domain", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            cliArgs: ["package"],
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        assetsPath: ".",
                        domain: "example.com",
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
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
            cliArgs: ["package"],
            config: Object.assign(baseConfig, {
                constructs: {
                    backend: {
                        type: "server-side-website",
                        assetsPath: ".",
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

    it("should synchronize files to S3", async () => {
        const awsMock = mockAws();
        sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("bucket-name");
        /*
         * This scenario simulates the following:
         * - logo.png is up to date, it should be ignored
         * - styles.css has changes, it should be updated to S3
         * - scripts.js is new, it should be created in S3
         * - image.jpg doesn't exist on disk, it should be removed from S3
         */
        awsMock.mockService("S3", "listObjectsV2").resolves({
            IsTruncated: false,
            Contents: [
                {
                    Key: "logo.png",
                    ETag: computeS3ETag(
                        fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/logo.png"))
                    ),
                },
                { Key: "styles.css" },
                { Key: "image.jpg" },
            ],
        });
        const putObjectSpy = awsMock.mockService("S3", "putObject");
        const deleteObjectsSpy = awsMock.mockService("S3", "deleteObjects");
        const cloudfrontInvalidationSpy = awsMock.mockService("CloudFront", "createInvalidation");

        await runServerless({
            fixture: "ServerSideWebsite",
            configExt: pluginConfigExt,
            cliArgs: ["backend:upload"],
        });

        // scripts.js and styles.css were updated
        sinon.assert.callCount(putObjectSpy, 2);
        expect(putObjectSpy.firstCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Key: "scripts.js",
            Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/scripts.js")),
            ContentType: "application/javascript",
        });
        expect(putObjectSpy.secondCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Key: "styles.css",
            Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/styles.css")),
            ContentType: "text/css",
        });
        // image.jpg was deleted
        sinon.assert.calledOnce(deleteObjectsSpy);
        expect(deleteObjectsSpy.firstCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Delete: {
                Objects: [
                    {
                        Key: "image.jpg",
                    },
                ],
            },
        });
        // A CloudFront invalidation was triggered
        sinon.assert.calledOnce(cloudfrontInvalidationSpy);
    });
});
