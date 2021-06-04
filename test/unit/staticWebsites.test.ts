import AWSMock from "aws-sdk-mock";
import * as sinon from "sinon";
import { ListObjectsV2Output, ListObjectsV2Request } from "aws-sdk/clients/s3";
import * as fs from "fs";
import * as path from "path";
import { baseConfig, pluginConfigExt, runServerless } from "../utils/runServerless";
import * as CloudFormationHelpers from "../../src/CloudFormation";
import { computeS3ETag } from "../../src/utils/s3-sync";

describe("static websites", () => {
    afterEach(() => {
        sinon.restore();
        AWSMock.restore();
    });

    it("should create all required resources", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            cliArgs: ["package"],
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "static-website",
                        path: ".",
                    },
                },
            }),
        });
        const bucketLogicalId = computeLogicalId("landing", "Bucket");
        const bucketPolicyLogicalId = computeLogicalId("landing", "Bucket", "Policy");
        const originAccessIdentityLogicalId = computeLogicalId("landing", "OriginAccessIdentity");
        const edgeFunction = computeLogicalId("landing", "EdgeFunction");
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN", "CFDistribution");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketLogicalId,
            bucketPolicyLogicalId,
            originAccessIdentityLogicalId,
            edgeFunction,
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
                            Action: "s3:GetObject",
                            Effect: "Allow",
                            Principal: {
                                CanonicalUser: {
                                    "Fn::GetAtt": [originAccessIdentityLogicalId, "S3CanonicalUserId"],
                                },
                            },
                            Resource: {
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
                        FunctionAssociations: [
                            {
                                EventType: "viewer-response",
                                FunctionARN: {
                                    "Fn::GetAtt": [edgeFunction, "FunctionARN"],
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
                            ConnectionAttempts: 3,
                            ConnectionTimeout: 10,
                            DomainName: {
                                "Fn::GetAtt": [bucketLogicalId, "RegionalDomainName"],
                            },
                            Id: "origin1",
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
                    PriceClass: "PriceClass_100",
                    ViewerCertificate: {
                        CloudFrontDefaultCertificate: true,
                    },
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
        expect(cfTemplate.Resources[edgeFunction]).toMatchObject({
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
            cliArgs: ["package"],
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "static-website",
                        path: ".",
                        domain: "example.com",
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN", "CFDistribution");
        // Check that CloudFront uses the custom ACM certificate and custom domain
        expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
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
            cliArgs: ["package"],
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "static-website",
                        path: ".",
                        domain: ["example.com", "www.example.com"],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN", "CFDistribution");
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
            cliArgs: ["package"],
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "static-website",
                        path: ".",
                        security: {
                            allowIframe: true,
                        },
                    },
                },
            }),
        });
        const edgeFunction = computeLogicalId("landing", "EdgeFunction");
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

    it("should synchronize files to S3", async () => {
        sinon.stub(CloudFormationHelpers, "getStackOutput").returns(Promise.resolve("bucket-name"));
        /*
         * This scenario simulates the following:
         * - index.html is up to date, it should be ignored
         * - styles.css has changes, it should be updated to S3
         * - scripts.js is new, it should be created in S3
         * - image.jpg doesn't exist on disk, it should be removed from S3
         */
        mockBucketContent([
            {
                Key: "index.html",
                ETag: computeS3ETag(
                    fs.readFileSync(path.join(__dirname, "../fixtures/staticWebsites/public/index.html"))
                ),
            },
            { Key: "styles.css" },
            { Key: "image.jpg" },
        ]);
        const putObjectSpy = sinon.stub().returns(Promise.resolve());
        AWSMock.mock("S3", "putObject", putObjectSpy);
        const deleteObjectsSpy = sinon.stub().returns(Promise.resolve());
        AWSMock.mock("S3", "deleteObjects", deleteObjectsSpy);
        const cloudfrontInvalidationSpy = sinon.stub().returns(Promise.resolve());
        AWSMock.mock("CloudFront", "createInvalidation", cloudfrontInvalidationSpy);

        await runServerless({
            fixture: "staticWebsites",
            configExt: pluginConfigExt,
            cliArgs: ["landing:upload"],
        });

        // scripts.js and styles.css were updated
        sinon.assert.callCount(putObjectSpy, 2);
        expect(putObjectSpy.firstCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Key: "scripts.js",
            Body: fs.readFileSync(path.join(__dirname, "../fixtures/staticWebsites/public/scripts.js")),
            ContentType: "application/javascript",
        });
        expect(putObjectSpy.secondCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Key: "styles.css",
            Body: fs.readFileSync(path.join(__dirname, "../fixtures/staticWebsites/public/styles.css")),
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

function mockBucketContent(objects: Array<{ Key: string; ETag?: string }>) {
    AWSMock.mock(
        "S3",
        "listObjectsV2",
        (params: ListObjectsV2Request, callback: (a: null, b: ListObjectsV2Output) => void) => {
            callback(null, {
                IsTruncated: false,
                Contents: objects,
            });
        }
    );
}
