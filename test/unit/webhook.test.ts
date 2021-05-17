import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("webhook", () => {
    it("should implement custom authorizer by default", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "webhook",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources[computeLogicalId("webhook", "stripe", "Route")]).toMatchObject({
            Properties: {
                AuthorizationType: "CUSTOM",
            },
        });
    });
    it("should allow insecure webhook", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "webhookInsecure",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources[computeLogicalId("webhook", "github", "Route")]).toMatchObject({
            Properties: {
                AuthorizationType: "NONE",
            },
        });
    });
});
