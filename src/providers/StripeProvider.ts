import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { parse as tomlParse } from "toml";
import { get, has } from "lodash";
import { Stripe } from "stripe";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import type { ProviderInterface } from "@lift/providers";
import type { FromSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";
import ServerlessError from "../utils/error";

const STRIPE_DEFINITION = {
    type: "object",
    properties: {
        profile: { type: "string" },
    },
    additionalProperties: false,
} as const;

type StripeConfiguration = {
    account_id: string;
    device_name: string;
    live_mode_api_key: string;
    live_mode_publishable_key: string;
    test_mode_api_key: string;
    test_mode_publishable_key: string;
};

type StripeConfigFile = { color: string } & Record<string, StripeConfiguration>;
type Configuration = FromSchema<typeof STRIPE_DEFINITION>;

export class StripeProvider implements ProviderInterface {
    public static type = "stripe";
    public static schema = STRIPE_DEFINITION;
    private static readonly constructClasses: Record<string, StaticConstructInterface> = {};

    static registerConstructs(...constructClasses: StaticConstructInterface[]): void {
        for (const constructClass of constructClasses) {
            if (constructClass.type in this.constructClasses) {
                throw new ServerlessError(
                    `The construct type '${constructClass.type}' was registered twice`,
                    "LIFT_CONSTRUCT_TYPE_CONFLICT"
                );
            }
            this.constructClasses[constructClass.type] = constructClass;
        }
    }

    static getConstructClass(type: string): StaticConstructInterface | undefined {
        return this.constructClasses[type];
    }

    static getAllConstructClasses(): StaticConstructInterface[] {
        return Object.values(this.constructClasses);
    }

    static create(serverless: Serverless, id: string, { profile }: Configuration): StripeProvider {
        return new this(serverless, id, profile);
    }

    private config: { apiKey: string; accountId?: string };
    public sdk: Stripe;
    constructor(private readonly serverless: Serverless, private readonly id: string, profile?: string) {
        this.config = this.resolveConfiguration(profile);
        this.sdk = new Stripe(this.config.apiKey, { apiVersion: "2020-08-27" });
    }

    createConstruct(type: string, id: string): ConstructInterface {
        const Construct = StripeProvider.getConstructClass(type);
        if (Construct === undefined) {
            throw new ServerlessError(
                `The construct '${id}' has an unknown type '${type}'\n` +
                    "Find all construct types available here: https://github.com/getlift/lift#constructs",
                "LIFT_UNKNOWN_CONSTRUCT_TYPE"
            );
        }
        const configuration = get(this.serverless.configurationInput.constructs, id, {});

        return Construct.create(this, id, configuration);
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
