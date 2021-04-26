import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("storage", () => {
    it("should create an S3 bucket with only lowercase letters", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "storage",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources.testStorageBucket72E88D6C).toMatchObject({
            Properties: { BucketEncryption: {} },
        });
    });
});
