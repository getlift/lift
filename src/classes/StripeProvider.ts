import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { parse as tomlParse } from "toml";
import { Stripe } from "stripe";
import { Serverless } from "../types/serverless";
import ServerlessError from "../utils/error";

type StripeConfiguration = {
    account_id: string;
    device_name: string;
    live_mode_api_key: string;
    live_mode_publishable_key: string;
    test_mode_api_key: string;
    test_mode_publishable_key: string;
};

type StripeConfigFile = { color: string } & Record<string, StripeConfiguration>;

export class StripeProvider {
    private config: { apiKey: string; accountId?: string };
    public provider: Stripe;
    constructor(private readonly serverless: Serverless) {
        this.config = this.resolveConfiguration();
        this.provider = new Stripe(this.config.apiKey, { apiVersion: "2020-08-27" });
    }

    resolveConfiguration(): { apiKey: string; accountId?: string } {
        // Sourcing from env
        if (typeof process.env.STRIPE_API_KEY === "string") {
            return { apiKey: process.env.STRIPE_API_KEY };
        }

        // Sourcing from TOML configuration file
        const configFilePath = resolve(homedir(), ".config/stripe/config.toml");
        if (existsSync(configFilePath)) {
            const stripeConfigurationFileContent = readFileSync(configFilePath);
            const stripeConfigurations = tomlParse(stripeConfigurationFileContent.toString()) as StripeConfigFile;
            const defaultStripeConfig = stripeConfigurations.default;

            return {
                apiKey: defaultStripeConfig.test_mode_api_key,
                accountId: defaultStripeConfig.account_id,
            };
        }

        // Fallback throw error
        throw new ServerlessError(
            "Could not source any Stripe configuration. Have you set your STRIPE_API_KEY environment?",
            "STRIPE_MISSING_CONFIGURATION"
        );
    }
}
