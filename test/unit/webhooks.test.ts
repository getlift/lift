import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("webhooks", () => {
    let cfTemplate: { Resources: Record<string, { Properties: Record<string, unknown> }> };
    let computeLogicalId: (...address: string[]) => string;
    beforeAll(async () => {
        ({ cfTemplate, computeLogicalId } = await runServerless({
            fixture: "webhooks",
            configExt: pluginConfigExt,
            command: "package",
        }));
    });
    test.each([
        ["secure", "CUSTOM"],
        ["insecure", "NONE"],
    ])("%p webhook should have authorization type %p", (useCase, expectedAuthorizationType) => {
        expect(cfTemplate.Resources[computeLogicalId(useCase, "Route")]).toMatchObject({
            Properties: {
                AuthorizationType: expectedAuthorizationType,
            },
        });
    });

    test.each([
        ["post", "POST"],
        ["put", "PUT"],
        ["patch", "PATCH"],
    ])("%p webhook should have method %p", (useCase, expectedMethod) => {
        expect(cfTemplate.Resources[computeLogicalId(useCase, "Route")]["Properties"]).toMatchObject({
            RouteKey: expectedMethod + " /" + expectedMethod.toLowerCase(),
        });
    });

    it("allows overriding webhook properties", () => {
        expect(cfTemplate.Resources[computeLogicalId("extendedWebhook", "Bus")].Properties).toMatchObject({
            Name: "myBus",
        });
        expect(cfTemplate.Resources[computeLogicalId("extendedWebhook", "HttpApi")].Properties).toMatchObject({
            FailOnWarnings: true,
        });
    });
});
