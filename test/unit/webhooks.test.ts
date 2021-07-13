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
});
