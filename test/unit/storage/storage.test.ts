import runServerless from "@serverless/test/run-serverless";

describe("storage", () => {
    it("should create an S3 bucket", async () => {
        const { cfTemplate } = await runServerless(
            "node_modules/serverless",
            {
                config: {
                    service: "storage",
                    provider: { name: "aws" },
                    plugins: [process.cwd() + "/src/plugin.ts"],
                    // @ts-ignore
                    storage: {
                        testStorage: {
                            encrypted: true,
                        },
                    },
                },
                cliArgs: ["package"],
            }
        )
        expect(cfTemplate.Resources.testStorage076AE1F5).toMatchObject({
            Properties: { BucketName: "teststorage" },
        });
    });
});
