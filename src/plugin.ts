import { has } from "lodash";
import type { JSONSchema } from "json-schema-to-ts";
import chalk from "chalk";
import { JSONSchema6 } from "json-schema";
import type { CommandsDefinition, Hook, Serverless, VariableResolver } from "./types/serverless";
import { Storage, STORAGE_DEFINITION } from "./constructs/aws/Storage";
import { Queue, QUEUE_DEFINITION } from "./constructs/aws/Queue";
import { STATIC_WEBSITE_DEFINITION, StaticWebsite } from "./constructs/aws/StaticWebsite";
import { Component } from "./constructs/Component";
import { Provider } from "./constructs/Provider";
import { NETLIFY_WEBSITE_DEFINITION, NetlifyWebsite } from "./constructs/netlify/NetlifyWebsite";
import { NetlifyProvider } from "./constructs/netlify/NetlifyProvider";
import { HTTP_API_DEFINITION, HttpApi } from "./constructs/aws/HttpApi";
import { AwsProvider } from "./constructs/aws/AwsProvider";

// TODO of course this should be dynamic in the real implementation
const componentsMap: Record<string, { class: any; schema: JSONSchema }> = {
    storage: {
        class: Storage,
        schema: STORAGE_DEFINITION,
    },
    queue: {
        class: Queue,
        schema: QUEUE_DEFINITION,
    },
    "static-website": {
        class: StaticWebsite,
        schema: STATIC_WEBSITE_DEFINITION,
    },
    "http-api": {
        class: HttpApi,
        schema: HTTP_API_DEFINITION,
    },
    "netlify/website": {
        class: NetlifyWebsite,
        schema: NETLIFY_WEBSITE_DEFINITION,
    },
};

type MinimallyValidConstructConfig = { type: string; provider: string; [k: string]: unknown };

/**
 * Serverless plugin
 */
class LiftPlugin {
    private readonly providers: Record<string, Provider<any>> = {};
    private readonly components: Record<string, Component<any>> = {};
    private readonly serverless: Serverless;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver> = {};

    constructor(serverless: Serverless) {
        this.serverless = serverless;

        this.hooks = {
            "before:aws:info:displayStackOutputs": this.info.bind(this),
            "before:package:finalize": async () => {
                for (const provider of Object.values(this.providers)) {
                    await provider.package();
                }
            },
            "before:deploy:deploy": async () => {
                for (const provider of Object.values(this.providers)) {
                    await provider.deploy();
                }
            },
            "after:remove:remove": async () => {
                for (const provider of Object.values(this.providers)) {
                    await provider.remove();
                }
            },
        };

        // TODO variables should be resolved just before deploying each provider
        // else we might get outdated values
        this.configurationVariablesSources = {
            // TODO these 2 variable sources should be merged eventually
            construct: {
                resolve: this.resolveOutput.bind(this),
            },
            reference: {
                resolve: this.resolveReference.bind(this),
            },
        };

        this.registerConfigSchema();
        this.loadProviders();
        this.loadComponents();
        this.registerCommands();
    }

    private registerConfigSchema() {
        // Providers
        // TODO For now providers are hardcoded: `aws` and `netlify`
        this.serverless.configSchemaHandler.defineTopLevelProperty("providers", {
            type: "object",
            properties: {
                aws: {
                    type: "object",
                    additionalProperties: false,
                },
                netlify: {
                    type: "object",
                    additionalProperties: false,
                },
            },
            additionalProperties: false,
        });
        // Constructs
        const constructProperties: { [k: string]: JSONSchema6 } = {};
        for (const [id, configuration] of Object.entries(this.normalizeConstructsConfig(false))) {
            const constructSchema = componentsMap[configuration.type].schema as JSONSchema6;
            // Require the `provider` property in root constructs
            if (constructSchema.properties !== undefined) {
                constructSchema.properties["provider"] = { type: "string" };
            }
            if (constructSchema.required !== undefined) {
                constructSchema.required.push("provider");
            }
            constructProperties[id] = constructSchema;
        }
        this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", {
            type: "object",
            properties: constructProperties,
            additionalProperties: false,
        });
    }

    private loadProviders() {
        const providersConfig = ((this.serverless.configurationInput as any).providers ?? {}) as Record<
            string,
            unknown
        >;
        for (const id of Object.keys(providersConfig)) {
            // TODO For now providers are hardcoded
            switch (id) {
                case "aws":
                    this.providers[id] = new AwsProvider(this.serverless, id);
                    break;
                case "netlify":
                    this.providers[id] = new NetlifyProvider(this.serverless, id);
                    break;
                default:
                    throw new Error(`Unknown provider '${id}'`);
            }
        }
    }

    private loadComponents() {
        for (const [id, configuration] of Object.entries(this.normalizeConstructsConfig(true))) {
            const provider = this.providers[configuration.provider];
            const type = componentsMap[configuration.type].class;
            // TODO type that more strongly
            const component = new type(provider, id, configuration);
            this.components[id] = component;
            provider.addComponent(id, component);
        }
    }

    async resolveOutput({ address }: { address: string }): Promise<{ value: string }> {
        const [id, property] = address.split(".", 2);

        if (!has(this.components, id)) {
            throw new Error(`No construct named '${id}' found in service file.`);
        }
        const component = this.components[id];

        const outputs = component.outputs();
        if (!has(outputs, property)) {
            throw new Error(
                `\${construct:${id}.${property}} does not exist. Outputs available on \${construct:${id}} are: ${Object.keys(
                    outputs
                ).join(", ")}.`
            );
        }

        // TODO: resolve value depending on the context:
        // - if it's a reference in the same stack, it should resolve to a CloudFormation reference
        // - if it's cross-stack, it should resolve to the real value
        return {
            value: (await outputs[property]()) ?? "",
        };
    }

    resolveReference({ address }: { address: string }): { value: Record<string, unknown> } {
        const [id, property] = address.split(".", 2);

        if (!has(this.components, id)) {
            throw new Error(`No component named '${id}' found in service file.`);
        }
        const component = this.components[id];

        const properties = component.references();
        if (!has(properties, property)) {
            throw new Error(
                `\${reference:${id}.${property}} does not exist. Properties available on \${reference:${id}} are: ${Object.keys(
                    properties
                ).join(", ")}.`
            );
        }

        return {
            value: properties[property](),
        };
    }

    async info(): Promise<void> {
        for (const [id, component] of Object.entries(this.components)) {
            const outputs = component.outputs();
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
        for (const [id, component] of Object.entries(this.components)) {
            const commands = component.commands();
            for (const [command, handler] of Object.entries(commands)) {
                this.commands[`${id}:${command}`] = {
                    lifecycleEvents: [command],
                };
                this.hooks[`${id}:${command}:${command}`] = handler;
            }
        }
    }

    /**
     * This method is mostly a helper to validate types.
     * It's a TypeScript mess right now, but it does the job.
     */
    private normalizeConstructsConfig(checkProvider: boolean): Record<string, MinimallyValidConstructConfig> {
        const serverlessConfig = (this.serverless.configurationInput as unknown) as Record<string, any>;
        const constructConfig: Record<string, MinimallyValidConstructConfig> = {};
        for (const [id, configuration] of Object.entries(serverlessConfig.constructs ?? {})) {
            if (!(configuration instanceof Object)) {
                throw new Error(`Construct '${id}' must be an object`);
            }
            if (!Object.prototype.hasOwnProperty.call(configuration, "type")) {
                throw new Error(`Construct '${id}' must have a 'type'`);
            }
            if (!Object.prototype.hasOwnProperty.call(configuration, "provider")) {
                throw new Error(`Construct '${id}' must have a 'provider'`);
            }
            const validConfig = configuration as { type: unknown; provider: unknown };
            if (typeof validConfig.type !== "string" || !(validConfig.type in componentsMap)) {
                throw new Error(`Construct '${id}' has an unknown type '${validConfig.type as string}'`);
            }
            if (typeof validConfig.provider !== "string") {
                throw new Error(`Construct '${id}' uses an unknown provider '${JSON.stringify(validConfig.provider)}'`);
            }
            const isValidProvider = validConfig.provider in this.providers;
            if (checkProvider && !isValidProvider) {
                throw new Error(`Construct '${id}' uses an unknown provider '${validConfig.provider}'`);
            }
            constructConfig[id] = validConfig as MinimallyValidConstructConfig;
        }

        return constructConfig;
    }
}

module.exports = LiftPlugin;
