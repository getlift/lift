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
                        VAR2: "bar",
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
