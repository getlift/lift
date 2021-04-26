import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe.only("common", () => {
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
});
