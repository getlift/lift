import { get, merge } from "lodash";
import * as sinon from "sinon";
import * as path from "path";
import * as CloudFormationHelpers from "../../src/CloudFormation";
import { baseConfig, pluginConfigExt, runServerless } from "../utils/runServerless";
import { expectVersionedAssetSync, mockVersionedAssetSync } from "../utils/versionedAssets";

const singlePageAppFixturePath = path.join(__dirname, "../fixtures/singlePageApp");

describe("single page app", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("should serve assets from a private S3 REST origin", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "single-page-app",
                        path: ".",
                    },
                },
            }),
        });
        const bucketLogicalId = computeLogicalId("landing", "Bucket");
        const bucketPolicyLogicalId = computeLogicalId("landing", "Bucket", "Policy");
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
        const cfOriginId = computeLogicalId("landing", "CDN", "Origin1");
        const resources = cfTemplate.Resources as Record<
            string,
            { Type: string; Properties?: Record<string, unknown> }
        >;
        const originAccessIdentity = Object.entries(resources).find(([, resource]) => {
            return resource.Type === "AWS::CloudFront::CloudFrontOriginAccessIdentity";
        });

        if (originAccessIdentity === undefined) {
            throw new Error("Missing CloudFront origin access identity");
        }
        expect(resources[bucketLogicalId]).toStrictEqual({
            Type: "AWS::S3::Bucket",
            UpdateReplacePolicy: "Delete",
            DeletionPolicy: "Delete",
        });
        expect(resources[bucketPolicyLogicalId]).toMatchObject({
            Type: "AWS::S3::BucketPolicy",
            Properties: {
                PolicyDocument: {
                    Statement: [
                        {
                            Action: "s3:GetObject",
                            Effect: "Allow",
                            Principal: {
                                CanonicalUser: {
                                    "Fn::GetAtt": [originAccessIdentity[0], "S3CanonicalUserId"],
                                },
                            },
                            Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/*"]] },
                        },
                    ],
                },
            },
        });
        expect(resources[cfDistributionLogicalId]).toMatchObject({
            Type: "AWS::CloudFront::Distribution",
            Properties: {
                DistributionConfig: {
                    Origins: [
                        {
                            DomainName: { "Fn::GetAtt": [bucketLogicalId, "RegionalDomainName"] },
                            Id: cfOriginId,
                            S3OriginConfig: {
                                OriginAccessIdentity: {
                                    "Fn::Join": [
                                        "",
                                        ["origin-access-identity/cloudfront/", { Ref: originAccessIdentity[0] }],
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        });
    });

    it("should define a request function that redirects nested uris to index.html", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "single-page-app",
                        path: ".",
                        domain: ["www.example.com", "example.com"],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
        const requestFunction = computeLogicalId("landing", "RequestFunction");
        const responseFunction = computeLogicalId("landing", "ResponseFunction");
        expect(cfTemplate.Resources[requestFunction]).toMatchInlineSnapshot(`
            {
              "Properties": {
                "AutoPublish": true,
                "FunctionCode": "var REDIRECT_REGEX = /^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|xml|pdf|webmanifest|avif|wasm|lottie)$)([^.]+$)/;

            function handler(event) {
                var uri = event.request.uri;
                var request = event.request;
                var isUriToRedirect = REDIRECT_REGEX.test(uri);

                if (isUriToRedirect) {
                    request.uri = "/index.html";
                }

                return event.request;
            }",
                "FunctionConfig": {
                  "Comment": "app-dev-us-east-1-landing-request",
                  "Runtime": "cloudfront-js-1.0",
                },
                "Name": "app-dev-us-east-1-landing-request",
              },
              "Type": "AWS::CloudFront::Function",
            }
        `);

        expect(
            get(
                cfTemplate.Resources[cfDistributionLogicalId],
                "Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations"
            )
        ).toMatchInlineSnapshot(`
            [
              {
                "EventType": "viewer-response",
                "FunctionARN": {
                  "Fn::GetAtt": [
                    "${responseFunction}",
                    "FunctionARN",
                  ],
                },
              },
              {
                "EventType": "viewer-request",
                "FunctionARN": {
                  "Fn::GetAtt": [
                    "${requestFunction}",
                    "FunctionARN",
                  ],
                },
              },
            ]
        `);
    });

    it("should allow to redirect to the main domain", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "single-page-app",
                        path: ".",
                        domain: ["www.example.com", "example.com"],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                        redirectToMainDomain: true,
                    },
                },
            }),
        });
        const requestFunction = computeLogicalId("landing", "RequestFunction");
        expect(cfTemplate.Resources[requestFunction].Properties.FunctionCode).toMatchInlineSnapshot(`
            "var REDIRECT_REGEX = /^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|xml|pdf|webmanifest|avif|wasm|lottie)$)([^.]+$)/;

            function handler(event) {
                var uri = event.request.uri;
                var request = event.request;
                var isUriToRedirect = REDIRECT_REGEX.test(uri);

                if (isUriToRedirect) {
                    request.uri = "/index.html";
                }
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

                return event.request;
            }"
        `);
    });

    it("should add an obsolete asset lifecycle rule when versioned assets are enabled", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "single-page-app",
                        path: ".",
                        versionedAssets: true,
                    },
                },
            }),
        });

        expect(cfTemplate.Resources[computeLogicalId("landing", "Bucket")]).toMatchObject({
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

    it("should tag obsolete files instead of deleting them when versioned assets are enabled", async () => {
        sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("bucket-name");
        const mocks = mockVersionedAssetSync({
            fixturePath: singlePageAppFixturePath,
            obsoleteKey: "old.js",
        });

        await runServerless({
            fixture: "singlePageApp",
            configExt: merge({}, pluginConfigExt, {
                constructs: {
                    landing: {
                        versionedAssets: true,
                    },
                },
            }),
            command: "landing:upload",
        });

        expectVersionedAssetSync({ obsoleteKey: "old.js", mocks });
    });

    it("allows overriding single page app properties", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "single-page-app",
                        path: ".",
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
        expect(cfTemplate.Resources[computeLogicalId("landing", "CDN")].Properties).toMatchObject({
            DistributionConfig: {
                Comment: "This is my comment",
            },
        });
        expect(cfTemplate.Resources[computeLogicalId("landing", "Bucket")].Properties).toMatchObject({
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
                        type: "single-page-app",
                        path: ".",
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
        expect(cfTemplate.Resources[computeLogicalId("suuuper-long-construct-name", "ResponseFunction")]).toMatchObject(
            {
                Type: "AWS::CloudFront::Function",
                Properties: {
                    Name: "app-super-long-stage-name-us-east-1-suuuper-long-construc-8c1f76",
                },
            }
        );
    });
});
