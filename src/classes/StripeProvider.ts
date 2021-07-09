import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { parse as tomlParse } from "toml";
import { get } from "lodash";
import { Stripe } from "stripe";
import { Serverless } from "../types/serverless";
import ServerlessError from "../utils/error";
import { ProviderInterface } from "./Provider";
import { ConstructInterface, StaticConstructInterface } from "./Construct";

type StripeConfiguration = {
    account_id: string;
    device_name: string;
    live_mode_api_key: string;
    live_mode_publishable_key: string;
    test_mode_api_key: string;
    test_mode_publishable_key: string;
};

type StripeConfigFile = { color: string } & Record<string, StripeConfiguration>;

export class StripeProvider implements ProviderInterface {
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

    private config: { apiKey: string; accountId?: string };
    public provider: Stripe;
    constructor(private readonly serverless: Serverless) {
        this.config = this.resolveConfiguration();
        this.provider = new Stripe(this.config.apiKey, { apiVersion: "2020-08-27" });
    }

    create(type: string, id: string): ConstructInterface {
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
