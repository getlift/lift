import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("storage", () => {
    it("should create an S3 bucket", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "storage",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources.storageavatarsBucketEA65C381).toMatchObject({
            Type: "AWS::S3::Bucket",
        });
    });
});
