import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("storage", () => {
    it("should create an S3 bucket with only lowercase letters", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "storage",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources.testStorage076AE1F5).toMatchObject({
            // user input for storage name was testStorage
            Properties: { BucketName: "teststorage" },
        });
    });
});
