import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("storage", () => {
    it("should create an S3 bucket", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "storage",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources[computeLogicalId("storage", "avatars", "Bucket")]).toMatchObject({
            Type: "AWS::S3::Bucket",
        });
    });
});
