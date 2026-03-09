import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("storage", () => {
    let cfTemplate: { Resources: Record<string, { Properties: Record<string, unknown> }> };
    let computeLogicalId: (...address: string[]) => string;
    beforeAll(async () => {
        ({ cfTemplate, computeLogicalId } = await runServerless({
            fixture: "storage",
            configExt: pluginConfigExt,
            command: "package",
        }));
    });
    describe("common tests", () => {
        const useCases = [["default"], ["kmsEncryption"]];
        test.each(useCases)("%p - should configure a lifecycle policy", (useCase) => {
            expect(
                cfTemplate.Resources[computeLogicalId(useCase, "Bucket")].Properties.LifecycleConfiguration
            ).toMatchObject({
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
                        NoncurrentVersionExpiration: {
                            NoncurrentDays: 30,
                        },
                        Status: "Enabled",
                    },
                ],
            });
        });
        test.each(useCases)("%p - should have versionning enabled", (useCase) => {
            expect(
                cfTemplate.Resources[computeLogicalId(useCase, "Bucket")].Properties.VersioningConfiguration
            ).toStrictEqual({ Status: "Enabled" });
        });
    });

    test.each([
        ["default", "AES256"],
        ["kmsEncryption", "aws:kms"],
    ])("should allow %p encryption", (construct, expectedSSEAlgorithm) => {
        expect(cfTemplate.Resources[computeLogicalId(construct, "Bucket")].Properties).toMatchObject({
            BucketEncryption: {
                ServerSideEncryptionConfiguration: [
                    {
                        ServerSideEncryptionByDefault: { SSEAlgorithm: expectedSSEAlgorithm },
                    },
                ],
            },
        });
    });

    it("allows overriding bucket properties", () => {
        expect(cfTemplate.Resources[computeLogicalId("extendedBucket", "Bucket")].Properties).toMatchObject({
            ObjectLockEnabled: true,
        });
    });

    it("allows overriding bucket properties with array", () => {
        expect(cfTemplate.Resources[computeLogicalId("extendedBucketWithArray", "Bucket")].Properties).toMatchObject({
            CorsConfiguration: {
                CorsRules: [
                    {
                        AllowedOrigins: ["*"],
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
                    },
                ],
            },
        });
    });

    it("supports custom lifecycleRules with auto-capitalization and default Status", () => {
        const lifecycleConfig = cfTemplate.Resources[computeLogicalId("withLifecycleRules", "Bucket")].Properties
            .LifecycleConfiguration as { Rules: unknown[] };
        expect(lifecycleConfig.Rules).toEqual([
            // Default rules
            {
                Status: "Enabled",
                Transitions: [{ StorageClass: "INTELLIGENT_TIERING", TransitionInDays: 0 }],
            },
            {
                Status: "Enabled",
                NoncurrentVersionExpiration: { NoncurrentDays: 30 },
            },
            // User rules (lowercase keys capitalized, Status: Enabled added by default)
            {
                Prefix: "tmp/",
                ExpirationInDays: 1,
                Status: "Enabled",
            },
            // User rule with already-capitalized keys and custom Status
            {
                Prefix: "cache/",
                ExpirationInDays: 7,
                Status: "Disabled",
            },
        ]);
    });
});
