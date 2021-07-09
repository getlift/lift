import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("storage", () => {
    it("should create an S3 bucket", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "storage",
            configExt: pluginConfigExt,
            command: "package",
        });
        const bucketId = computeLogicalId("avatars", "Bucket");
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            bucketId,
            computeLogicalId("avatars", "Bucket", "Policy"),
        ]);
        expect(cfTemplate.Resources[bucketId]).toStrictEqual({
            Type: "AWS::S3::Bucket",
            UpdateReplacePolicy: "Retain",
            DeletionPolicy: "Retain",
            Properties: {
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [
                        {
                            ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
                        },
                    ],
                },
                LifecycleConfiguration: {
                    Rules: [
                        {
                            Status: "Enabled",
                            Transitions: [
                                {
                                    StorageClass: "INTELLIGENT_TIERING",
                                    TransitionInDays: 0,
                                },
                            ],
                        },
                        {
                            NoncurrentVersionExpirationInDays: 30,
                            Status: "Enabled",
                        },
                    ],
                },
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true,
                },
                VersioningConfiguration: {
                    Status: "Enabled",
                },
            },
        });
    });
});
