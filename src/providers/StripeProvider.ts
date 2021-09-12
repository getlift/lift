import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { parse as tomlParse } from "toml";
import { has } from "lodash";
import { Stripe } from "stripe";
import type { Serverless } from "../types/serverless";
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
    public sdk: Stripe;
    constructor(private readonly serverless: Serverless, private readonly id: string, profile?: string) {
        this.config = this.resolveConfiguration(profile);
        this.sdk = new Stripe(this.config.apiKey, { apiVersion: "2020-08-27" });
    }

    resolveConfiguration(profile?: string): { apiKey: string; accountId?: string } {
        // Sourcing from env
        if (profile === undefined && typeof process.env.STRIPE_API_KEY === "string") {
            return { apiKey: process.env.STRIPE_API_KEY };
        }

        // Sourcing from TOML configuration file
        const configsPath = process.env.XDG_CONFIG_HOME ?? resolve(homedir(), ".config");
        const stripeConfigFilePath = resolve(configsPath, "stripe/config.toml");
        if (!existsSync(stripeConfigFilePath)) {
            throw new ServerlessError(
                "Could not source any Stripe configuration. Have you set your STRIPE_API_KEY environment?",
                "STRIPE_MISSING_CONFIGURATION"
            );
        }

        const stripeConfigurationFileContent = readFileSync(stripeConfigFilePath);
        const stripeConfigurations = tomlParse(stripeConfigurationFileContent.toString()) as StripeConfigFile;
        if (profile !== undefined) {
            if (!has(stripeConfigurations, profile)) {
                throw new ServerlessError(
                    `There is no ${profile} profile in your stripe configuration. Found profiles are ${Object.keys(
                        stripeConfigurations
                    )
                        .filter((stripeConfiguration) => stripeConfiguration !== "color")
                        .join(", ")}`,
                    "STRIPE_MISSING_PROFILE"
                );
            }
            const stripeConfig = stripeConfigurations[profile];

            return {
                apiKey: stripeConfig.test_mode_api_key,
                accountId: stripeConfig.account_id,
            };
        }
        // Fallback to default profile
        if (!has(stripeConfigurations, "default")) {
            throw new ServerlessError(
                `There is no default profile in your stripe configuration. Please provide one of the found profiles: ${Object.keys(
                    stripeConfigurations
                )
                    .filter((stripeConfiguration) => stripeConfiguration !== "color")
                    .join(", ")}`,
                "STRIPE_MISSING_DEFAULT_PROFILE"
            );
        }
        const defaultStripeConfig = stripeConfigurations.default;

        return {
            apiKey: defaultStripeConfig.test_mode_api_key,
            accountId: defaultStripeConfig.account_id,
        };
    }
}
