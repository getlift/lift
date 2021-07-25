import { resolve } from "path";
import { get } from "lodash";
import type { StripeProvider } from "@lift/providers";
import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("stripe", () => {
    describe("when an existing STRIPE_API_KEY env is set", () => {
        let serverless: Record<string, unknown>;
        beforeAll(async () => {
            ({ serverless } = await runServerless({
                fixture: "stripe",
                configExt: pluginConfigExt,
                command: "package",
                env: {
                    STRIPE_API_KEY: "rk_test_key_from_env",
                    XDG_CONFIG_HOME: resolve(process.cwd(), "test/fixtures/stripe/.config"),
                },
            }));
        });

        test.each([
            ["stripeProviderWithProfile", "rk_test_key_from_toml_file"],
            ["stripeProviderWithoutProfile", "rk_test_key_from_env"],
        ])("should source the correct key for provider %p", (useCase, expectedApiKey) => {
            // @ts-expect-error serverless object in unknown and can vary
            const stripeProvider = serverless.getLiftProviderById(useCase) as StripeProvider;
            const stripeApiKey = (get(stripeProvider, "sdk._api.auth") as string).slice(7);
            expect(stripeApiKey).toBe(expectedApiKey);
        });
    });
    it("should throw when no STRIPE_API_KEY env is set and one provider has no profile", async () => {
        await expect(
            runServerless({
                fixture: "stripe",
                configExt: pluginConfigExt,
                command: "package",
                env: {
                    XDG_CONFIG_HOME: resolve(process.cwd(), "test/fixtures/stripe/.config"),
                },
            })
        ).rejects.toThrow(/There is no default profile in your stripe configuration/);
    });
});
