import { runServerlessCli } from "../utils/runServerlessCli";

describe("variables", () => {
    it("should resolve construct variables", async () => {
        const { cfTemplate } = await runServerlessCli({
            fixture: "variables",
            command: "package",
        });
        // Resolves construct variables in `functions`
        expect(cfTemplate.Resources.FooLambdaFunction).toHaveProperty("Properties.Environment.Variables.VAR1", {
            Ref: "barQueueB989EBF4",
        });
        // Resolves construct variables in `resources`
        expect(cfTemplate.Resources.UserDefinedResource).toHaveProperty("Properties.BucketName", {
            Ref: "barQueueB989EBF4",
        });
        // Resolves construct variables in `custom`
        expect(cfTemplate.Resources.FooLambdaFunction).toHaveProperty("Properties.Environment.Variables.CUSTOM_VAR", {
            Ref: "bucketBucketF19722A9",
        });
    });

    it("should resolve variables in constructs", async () => {
        const { cfTemplate } = await runServerlessCli({
            fixture: "variables",
            command: "package",
        });
        expect(cfTemplate.Resources.BarWorkerLambdaFunction).toHaveProperty("Properties.Environment.Variables", {
            // Native serverless variable
            VAR1: "bar",
            // Custom variables defined by plugins (using a different API every time
            CUSTOM_VAR1: "Custom variable 1",
            CUSTOM_VAR2: "Custom variable 2",
        });
        // ${construct:bucket.bucketName} should have been resolved
        expect(cfTemplate.Resources.barAlarmTopicSubscription56286022).toHaveProperty("Properties.Endpoint", {
            Ref: "bucketBucketF19722A9",
        });
        expect(cfTemplate.Resources.appCDN7AD2C001).toMatchObject({
            Properties: {
                DistributionConfig: {
                    Aliases: ["Custom variable 1"],
                    ViewerCertificate: {
                        AcmCertificateArn:
                            "arn:aws:acm:us-east-1:123466615250:certificate/abcdef-b896-4725-96e3-6f143d06ac0b",
                    },
                },
            },
        });
    });
});
