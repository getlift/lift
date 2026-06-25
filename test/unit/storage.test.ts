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

    it("should not set OwnershipControls by default", () => {
        expect(cfTemplate.Resources[computeLogicalId("default", "Bucket")].Properties).not.toHaveProperty(
            "OwnershipControls"
        );
    });

    it("should set OwnershipControls when allowAcl is true", () => {
        expect(cfTemplate.Resources[computeLogicalId("withAcl", "Bucket")].Properties).toMatchObject({
            OwnershipControls: {
                Rules: [{ ObjectOwnership: "BucketOwnerPreferred" }],
            },
        });
    });

    it("should not set CorsConfiguration by default", () => {
        expect(cfTemplate.Resources[computeLogicalId("default", "Bucket")].Properties).not.toHaveProperty(
            "CorsConfiguration"
        );
    });

    it("should configure CORS with default methods when cors is a string", () => {
        expect(cfTemplate.Resources[computeLogicalId("withCorsString", "Bucket")].Properties).toMatchObject({
            CorsConfiguration: {
                CorsRules: [
                    {
                        AllowedOrigins: ["*"],
                        AllowedMethods: ["GET", "PUT", "DELETE"],
                        AllowedHeaders: ["*"],
                    },
                ],
            },
        });
    });

    it("should configure CORS with full rules when cors is an array", () => {
        expect(cfTemplate.Resources[computeLogicalId("withCorsRules", "Bucket")].Properties).toMatchObject({
            CorsConfiguration: {
                CorsRules: [
                    {
                        AllowedOrigins: ["https://example.com"],
                        AllowedMethods: ["PUT"],
                        AllowedHeaders: ["*"],
                    },
                ],
            },
        });
    });

    it("should block all public access by default", () => {
        expect(cfTemplate.Resources[computeLogicalId("default", "Bucket")].Properties).toMatchObject({
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
            },
        });
    });

    it("should open only the policy levers when publicPath is set", () => {
        expect(cfTemplate.Resources[computeLogicalId("withPublicPath", "Bucket")].Properties).toMatchObject({
            PublicAccessBlockConfiguration: {
                // ACL writes still rejected (strict, no allowAcl)
                BlockPublicAcls: true,
                IgnorePublicAcls: true,
                // Policy levers opened so the public-read bucket policy can take effect
                BlockPublicPolicy: false,
                RestrictPublicBuckets: false,
            },
        });
    });

    it("should grant anonymous read scoped to the public prefix only", () => {
        const bucketLogicalId = computeLogicalId("withPublicPath", "Bucket");
        const policy = cfTemplate.Resources[computeLogicalId("withPublicPath", "Bucket", "Policy")].Properties
            .PolicyDocument as { Statement: unknown[] };
        expect(policy.Statement).toContainEqual({
            Action: "s3:GetObject",
            Effect: "Allow",
            Principal: { AWS: "*" },
            Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/public/*"]] },
        });
    });

    it("should accept-but-ignore public ACLs when publicPath is combined with allowAcl", () => {
        expect(cfTemplate.Resources[computeLogicalId("withPublicPathAndAcl", "Bucket")].Properties).toMatchObject({
            // storePublicly()/visibility:public writes are accepted...
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: false,
                // ...but the public ACL is inert; the bucket policy is the only public-access mechanism
                IgnorePublicAcls: true,
                BlockPublicPolicy: false,
                RestrictPublicBuckets: false,
            },
            OwnershipControls: {
                Rules: [{ ObjectOwnership: "BucketOwnerPreferred" }],
            },
        });
    });

    it("normalizes the publicPath prefix (strips leading/trailing slashes)", () => {
        // 'withPublicPathAndAcl' is configured with `publicPath: /public/`
        const bucketLogicalId = computeLogicalId("withPublicPathAndAcl", "Bucket");
        const policy = cfTemplate.Resources[computeLogicalId("withPublicPathAndAcl", "Bucket", "Policy")].Properties
            .PolicyDocument as { Statement: unknown[] };
        expect(policy.Statement).toContainEqual({
            Action: "s3:GetObject",
            Effect: "Allow",
            Principal: { AWS: "*" },
            Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/public/*"]] },
        });
    });

    it.each([["withPublicPathSlash"], ["withPublicPathStar"]])(
        "makes the whole bucket public when publicPath is '/' or '*' (%p)",
        (useCase) => {
            const bucketLogicalId = computeLogicalId(useCase, "Bucket");
            const policy = cfTemplate.Resources[computeLogicalId(useCase, "Bucket", "Policy")].Properties
                .PolicyDocument as { Statement: unknown[] };
            expect(policy.Statement).toContainEqual({
                Action: "s3:GetObject",
                Effect: "Allow",
                Principal: { AWS: "*" },
                // The whole bucket (every object) is public, not just a prefix
                Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/*"]] },
            });
        }
    );

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
