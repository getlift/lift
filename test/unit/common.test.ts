import { pluginConfigExt, runServerless } from "../utils/runServerless";
import { runServerlessCli } from "../utils/runServerlessCli";

describe("common", () => {
    it("should not override user defined resources in serverless.yml", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "common",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources).toMatchObject({
            UserDefinedResource: {},
        });
    });

    it("should resolve variables", async () => {
        const { cfTemplate } = await runServerlessCli({
            fixture: "variables",
            command: "package",
        });
        // Resolves construct variables in `functions`
        expect(cfTemplate.Resources.FooLambdaFunction).toMatchObject({
            Properties: {
                Environment: {
                    Variables: {
                        VAR1: {
                            Ref: "barQueueB989EBF4",
                        },
                    },
                },
            },
        });
        // Resolves Framework variables in `constructs`
        expect(cfTemplate.Resources.BarWorkerLambdaFunction).toMatchObject({
            Properties: {
                Environment: {
                    Variables: {
                        VAR1: "bar",
                        CUSTOM_VAR1: "Custom variable 1",
                        CUSTOM_VAR2: "Custom variable 2",
                        CUSTOM_VAR3: "Custom variable 3",
                        CUSTOM_VAR4: "Custom variable 4",
                    },
                },
            },
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
        // Resolves construct variables in `resources`
        expect(cfTemplate.Resources.UserDefinedResource).toMatchObject({
            Properties: {
                BucketName: {
                    Ref: "barQueueB989EBF4",
                },
            },
        });
    });
});
