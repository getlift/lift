import { get } from "lodash";
import { baseConfig, runServerless } from "../utils/runServerless";

describe("upload", () => {
    it("should create all required resources with HTTP API", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    upload: {
                        type: "upload",
                    },
                },
            }),
        });

        const bucket = computeLogicalId("upload", "Bucket");
        const bucketPolicy = computeLogicalId("upload", "Bucket", "Policy");
        const uploadFunction = computeLogicalId("upload", "Function");
        const httpApiRoute = computeLogicalId("upload", "Route");

        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucket,
            bucketPolicy,
            uploadFunction,
            "uploadRouteuploadRoute2545F0B8PermissionCB079AC2",
            "uploadRouteHttpIntegration02104492e88c1940a1c8d0dbac532c8091C83E5A",
            httpApiRoute,
            "uploadCORSRouteuploadCORSRouteA2C80313PermissionEA9DCB1F",
            "uploadCORSRouteC21947AF",
        ]);
    });
    it("should create all required resources with REST API", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    upload: {
                        type: "upload",
                        apiGateway: "rest",
                    },
                },
            }),
        });

        const bucket = computeLogicalId("upload", "Bucket");
        const bucketPolicy = computeLogicalId("upload", "Bucket", "Policy");
        const uploadFunction = computeLogicalId("upload", "Function");

        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucket,
            bucketPolicy,
            uploadFunction,
            "uploadRestApiuploadurl2A547A06",
            "uploadRestApiuploadurlOPTIONS1BD5E4F2",
            "uploadRestApiuploadurlPOSTApiPermissionuploadRestApiC195B6D4POSTuploadurlE1E5BEF5",
            "uploadRestApiuploadurlPOSTApiPermissionTestuploadRestApiC195B6D4POSTuploadurl7144EDCF",
            "uploadRestApiuploadurlPOST347E9EEB",
        ]);
    });

    it("should delete files after 1 day", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    upload: {
                        type: "upload",
                    },
                },
            }),
        });

        expect(
            get(cfTemplate.Resources[computeLogicalId("upload", "Bucket")].Properties, "LifecycleConfiguration")
        ).toStrictEqual({
            Rules: [
                {
                    ExpirationInDays: 1,
                    Status: "Enabled",
                },
            ],
        });
    });

    it("should enable CORS on the bucket", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    upload: {
                        type: "upload",
                    },
                },
            }),
        });

        expect(
            get(cfTemplate.Resources[computeLogicalId("upload", "Bucket")].Properties, "CorsConfiguration")
        ).toStrictEqual({
            CorsRules: [
                {
                    AllowedHeaders: ["*"],
                    AllowedMethods: ["PUT"],
                    AllowedOrigins: ["*"],
                },
            ],
        });
    });

    it("should enable block public access on the bucket", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    upload: {
                        type: "upload",
                    },
                },
            }),
        });

        expect(
            get(cfTemplate.Resources[computeLogicalId("upload", "Bucket")].Properties, "PublicAccessBlockConfiguration")
        ).toStrictEqual({
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
        });
    });

    test.each([
        ["s3", "AES256"],
        ["kms", "aws:kms"],
    ])("should allow %p encryption", async (encryption, expectedSSEAlgorithm) => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    upload: {
                        type: "upload",
                        encryption: encryption,
                    },
                },
            }),
        });

        expect(cfTemplate.Resources[computeLogicalId("upload", "Bucket")].Properties).toMatchObject({
            BucketEncryption: {
                ServerSideEncryptionConfiguration: [
                    {
                        ServerSideEncryptionByDefault: { SSEAlgorithm: expectedSSEAlgorithm },
                    },
                ],
            },
        });
    });
});
