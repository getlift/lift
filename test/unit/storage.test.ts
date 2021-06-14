import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("storage", () => {
    it("should create an S3 bucket", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "storage",
            configExt: pluginConfigExt,
            command: "package",
        });
        expect(cfTemplate.Resources[computeLogicalId("avatars", "Bucket")]).toMatchObject({
            Type: "AWS::S3::Bucket",
        });
    });
});
