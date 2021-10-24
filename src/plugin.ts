import { flatten, get, has, merge } from "lodash";
import chalk from "chalk";
import { DefaultTokenResolver, Lazy, StringConcat, Tokenization } from "@aws-cdk/core";
import type { ProviderInterface, StaticProviderInterface } from "@lift/providers";
import { AwsProvider, StripeProvider } from "@lift/providers";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import ServerlessError from "./utils/error";
import type { ServerlessConfig } from "./Config";
import { readConfig } from "./Config";

const PROVIDER_ID_PATTERN = "^[a-zA-Z0-9-_]+$";
// This enables all existing constructs defined prior intoduction of "providers" property to work
const DEFAULT_PROVIDER = "defaultAwsProvider";
const PROVIDERS_DEFINITION = {
    type: "object",
    patternProperties: {
        [PROVIDER_ID_PATTERN]: {
            allOf: [
                {
                    type: "object",
                    properties: {
                        type: { type: "string" },
                    },
                    required: ["type"],
                },
            ] as Record<string, unknown>[],
        },
    },
    additionalProperties: false,
};

const CONSTRUCT_ID_PATTERN = "^[a-zA-Z0-9-_]+$";
const CONSTRUCTS_DEFINITION = {
    type: "object",
    patternProperties: {
        [CONSTRUCT_ID_PATTERN]: {
            allOf: [
                {
                    type: "object",
                    properties: {
                        type: { type: "string" },
                        provider: { type: "string" },
                    },
                    required: ["type"],
                },
            ],
        },
    },
    additionalProperties: false,
} as const;

const LIFT_CONFIG_SCHEMA = {
    type: "object",
    properties: {
        automaticPermissions: { type: "boolean" },
    },
    additionalProperties: false,
} as const;

export default class Lift {
    private constructs: Record<string, ConstructInterface> = {};
    private providers: Record<string, ProviderInterface> = {};
    private static readonly providerClasses: Record<string, StaticProviderInterface> = {};
    private readonly providersSchema = PROVIDERS_DEFINITION;
    private readonly constructsSchema = CONSTRUCTS_DEFINITION;
    private readonly config: ServerlessConfig;

    constructor() {
        this.config = readConfig();
        this.loadProviders();
        this.registerConstructsSchema();
        this.registerProvidersSchema();
        this.registerConfigSchema();
        // this.registerCommands();
        this.loadConstructs();
        // this.resolveLazyVariables();
    }

    private registerConstructsSchema() {
        (
            this.constructsSchema.patternProperties[CONSTRUCT_ID_PATTERN].allOf as unknown as Record<string, unknown>[]
        ).push({
            oneOf: this.getAllConstructClasses().map((Construct) => {
                return this.defineSchemaWithType(Construct.type, Construct.schema);
            }),
        });
    }

    private registerProvidersSchema() {
        this.providersSchema.patternProperties[PROVIDER_ID_PATTERN].allOf.push({
            oneOf: Lift.getAllProviderClasses().map((Provider) => {
                return this.defineSchemaWithType(Provider.type, Provider.schema);
            }),
        });
    }

    private defineSchemaWithType(type: string, configSchema: Record<string, unknown>): Record<string, unknown> {
        return merge(configSchema, { properties: { type: { const: type } } });
    }

    private registerConfigSchema() {
        // this.configSchema.defineTopLevelProperty("lift", LIFT_CONFIG_SCHEMA);
        // this.configSchema.defineTopLevelProperty("constructs", this.constructsSchema);
        // this.configSchema.defineTopLevelProperty("providers", this.providersSchema);
    }

    static registerProviders(...providerClasses: StaticProviderInterface[]): void {
        for (const providerClass of providerClasses) {
            if (providerClass.type in this.providerClasses) {
                throw new ServerlessError(
                    `The provider type '${providerClass.type}' was registered twice`,
                    "LIFT_PROVIDER_TYPE_CONFLICT"
                );
            }
            this.providerClasses[providerClass.type] = providerClass;
        }
    }

    static getProviderClass(type: string): StaticProviderInterface | undefined {
        return this.providerClasses[type];
    }

    static getAllProviderClasses(): StaticProviderInterface[] {
        return Object.values(this.providerClasses);
    }

    private loadProviders() {
        for (const [id, providerConfig] of Object.entries(this.config.providers)) {
            const type = get(providerConfig, "type", undefined);
            if (type === undefined) {
                throw new ServerlessError(
                    `The provider '${id}' must have a "type" property.`,
                    "LIFT_UNKNOWN_PROVIDER_TYPE"
                );
            }
            this.providers[id] = this.createProvider(type, id, providerConfig as Record<string, unknown>);
        }
    }

    private createProvider(type: string, id: string, configuration: Record<string, unknown>): ProviderInterface {
        const Provider = Lift.getProviderClass(type);
        if (Provider === undefined) {
            throw new ServerlessError(
                `The provider '${id}' has an unknown type '${type}'`,
                "LIFT_UNKNOWN_PROVIDER_TYPE"
            );
        }

        return Provider.create(id, configuration, this.config);
    }

    private loadConstructs(): void {
        for (const [id, config] of Object.entries(this.config.constructs)) {
            if (config.provider === undefined) {
                throw new ServerlessError(
                    `The construct '${id}' must have a "provider" property.`,
                    "LIFT_UNKNOWN_PROVIDER_ID"
                );
            }
            if (config.type === undefined) {
                throw new ServerlessError(
                    `The construct '${id}' must have a "type" property.`,
                    "LIFT_UNKNOWN_CONSTRUCT_TYPE"
                );
            }
            const provider = this.getLiftProviderById(config.provider);
            if (!provider) {
                throw new ServerlessError(
                    `No provider ${
                        config.provider
                    } was found for construct ${id}. Available providers are ${Object.keys(this.providers).join(", ")}`,
                    "LIFT_UNKNOWN_PROVIDER_ID"
                );
            }
            this.constructs[id] = provider.createConstruct(config.type, id, config as Record<string, unknown>);
        }
    }

    getLiftProviderById(id: string): ProviderInterface | undefined {
        return this.providers[id];
    }

    resolveReference({ address }: { address: string }): { value: string } {
        return {
            /**
             * Construct variables are resolved lazily using the CDK's "Token" system.
             * CDK Lazy values generate a unique `${Token[TOKEN.63]}` string. These strings
             * can later be resolved to the real value (which we do in `initialize()`).
             * Problem:
             * - Lift variables need constructs to be resolved
             * - Constructs can be created when Serverless variables are resolved
             * - Serverless variables must resolve Lift variables
             * This is a chicken and egg problem.
             * Solution:
             * - Serverless boots, plugins are created
             * - variables are resolved
             *   - Lift variables are resolved to CDK tokens (`${Token[TOKEN.63]}`) via `Lazy.any(...)`
             *     (we can't resolve the actual values since we don't have the constructs yet)
             * - `initialize` hook
             *   - Lift builds the constructs
             *   - CDK tokens are resolved into real value: we can now do that using the CDK "token resolver"
             */
            value: Lazy.any({
                produce: () => {
                    const [id, property] = address.split(".", 2);
                    if (!has(this.constructs, id)) {
                        throw new ServerlessError(
                            `No construct named '${id}' was found, the \${construct:${id}.${property}} variable is invalid.`,
                            "LIFT_VARIABLE_UNKNOWN_CONSTRUCT"
                        );
                    }
                    const construct = this.constructs[id];

                    const properties = construct.variables ? construct.variables() : {};
                    if (!has(properties, property)) {
                        if (Object.keys(properties).length === 0) {
                            throw new ServerlessError(
                                `\${construct:${id}.${property}} does not exist. The construct '${id}' does not expose any property`,
                                "LIFT_VARIABLE_UNKNOWN_PROPERTY"
                            );
                        }
                        throw new ServerlessError(
                            `\${construct:${id}.${property}} does not exist. Properties available on \${construct:${id}} are: ${Object.keys(
                                properties
                            ).join(", ")}`,
                            "LIFT_VARIABLE_UNKNOWN_PROPERTY"
                        );
                    }

                    return properties[property];
                },
            }).toString(),
        };
    }

    async info(): Promise<void> {
        for (const [id, construct] of Object.entries(this.constructs)) {
            if (typeof construct.outputs !== "function") {
                continue;
            }
            const outputs = construct.outputs();
            if (Object.keys(outputs).length > 0) {
                console.log(chalk.yellow(`${id}:`));
                for (const [name, resolver] of Object.entries(outputs)) {
                    const output = await resolver();
                    if (output !== undefined) {
                        console.log(`  ${name}: ${output}`);
                    }
                }
            }
        }
    }

    private registerCommands() {
        const constructsConfiguration = get(this.config, "constructs", {}) as Record<string, { type?: string }>;
        // For each construct
        for (const [id, constructConfig] of Object.entries(constructsConfiguration)) {
            if (constructConfig.type === undefined) {
                throw new ServerlessError(
                    `The construct '${id}' has no 'type' defined.\n` +
                        "Find all construct types available here: https://github.com/getlift/lift#constructs",
                    "LIFT_MISSING_CONSTRUCT_TYPE"
                );
            }
            const constructClass = this.getConstructClass(constructConfig.type);
            if (constructClass === undefined) {
                throw new ServerlessError(
                    `The construct '${id}' has an unknown type '${constructConfig.type}'\n` +
                        "Find all construct types available here: https://github.com/getlift/lift#constructs",
                    "LIFT_UNKNOWN_CONSTRUCT_TYPE"
                );
            }
            if (constructClass.commands === undefined) {
                continue;
            }
            // For each command of the construct
            for (const [command, commandDefinition] of Object.entries(constructClass.commands)) {
                this.commands[`${id}:${command}`] = {
                    lifecycleEvents: [command],
                    usage: commandDefinition.usage,
                    options: commandDefinition.options,
                };
                // Register the command handler
                this.hooks[`${id}:${command}:${command}`] = () => {
                    // We resolve the construct instance on the fly
                    const construct = this.getConstructs()[id];

                    return commandDefinition.handler.call(construct, this.cliOptions);
                };
            }
        }
    }

    async deploy(): Promise<void> {
        for (const provider of Object.values(this.providers)) {
            await provider.deploy();
        }
    }

    private resolveLazyVariables() {
        // Use the CDK token resolver to resolve all lazy variables in the template
        const tokenResolver = new DefaultTokenResolver(new StringConcat());
        const resolveTokens = <T>(input: T): T => {
            if (input === undefined) {
                return input;
            }

            return Tokenization.resolve(input, {
                resolver: tokenResolver,
                scope: (this.providers[DEFAULT_PROVIDER] as AwsProvider).stack,
            }) as T;
        };
        this.serverless.configurationInput = resolveTokens(this.serverless.configurationInput);
    }

    private getAllConstructClasses(): StaticConstructInterface[] {
        const result = flatten(
            Lift.getAllProviderClasses().map((providerClass) => providerClass.getAllConstructClasses())
        );

        return result;
    }

    private getConstructClass(constructType: string): StaticConstructInterface | undefined {
        for (const providerClass of Lift.getAllProviderClasses()) {
            const constructClass = providerClass.getConstructClass(constructType);
            if (constructClass !== undefined) {
                return constructClass;
            }
        }

        return undefined;
    }
}

Lift.registerProviders(AwsProvider, StripeProvider);
