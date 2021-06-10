import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("webhooks", () => {
    it("should implement custom authorizer by default", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "webhooks",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources[computeLogicalId("stripe", "Route")]).toMatchObject({
            Properties: {
                AuthorizationType: "CUSTOM",
            },
        });
    });
    it("should allow insecure webhook", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "webhooks",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources[computeLogicalId("github", "Route")]).toMatchObject({
            Properties: {
                AuthorizationType: "NONE",
            },
        });
    });

    it("should generate only a single bus", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "webhooks",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources[computeLogicalId("Bus")]).toMatchObject({
            Properties: {
                Name: "Bus",
            },
        });
        expect(cfTemplate.Resources[computeLogicalId("github", "Integration")]).toMatchObject({
            Properties: {
                RequestParameters: {
                    EventBusName: {
                        Ref: computeLogicalId("Bus"),
                    },
                },
            },
        });
        expect(cfTemplate.Resources[computeLogicalId("stripe", "Integration")]).toMatchObject({
            Properties: {
                RequestParameters: {
                    EventBusName: {
                        Ref: computeLogicalId("Bus"),
                    },
                },
            },
        });
    });
});
