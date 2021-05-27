import { has } from "lodash";
import type { JSONSchema } from "json-schema-to-ts";
import chalk from "chalk";
import { JSONSchema6Definition } from "json-schema";
import type { CommandsDefinition, Hook, Serverless, VariableResolver } from "./types/serverless";
import { Storage, STORAGE_DEFINITION } from "./constructs/Storage";
import { Queue, QUEUE_DEFINITION } from "./constructs/Queue";
import { STATIC_WEBSITE_DEFINITION, StaticWebsite } from "./constructs/StaticWebsite";
import { Component } from "./constructs/Component";
import { AwsProvider } from "./constructs/Provider";
import { AwsComponent } from "./constructs/AwsComponent";
import { NETLIFY_WEBSITE_DEFINITION, NetlifyWebsite } from "./constructs/NetlifyWebsite";
import { NetlifyProvider } from "./constructs/NetlifyProvider";
import { HTTP_API_DEFINITION, HttpApi } from "./constructs/HttpApi";

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

/**
 * Serverless plugin
 */
class LiftPlugin {
    private readonly awsProvider: AwsProvider;
    private readonly netlifyProvider: NetlifyProvider;
    private readonly components: Record<string, Component<any>> = {};
    private readonly serverless: Serverless;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver> = {};

    constructor(serverless: Serverless) {
        this.serverless = serverless;
        this.awsProvider = new AwsProvider(this.serverless, "aws");
        this.netlifyProvider = new NetlifyProvider(this.serverless, "netlify");

        this.hooks = {
            "before:aws:info:displayStackOutputs": this.info.bind(this),
            "before:package:finalize": async () => await this.awsProvider.package(),
            "before:deploy:deploy": async () => {
                await this.netlifyProvider.deploy();
                await this.awsProvider.deploy();
            },
            "after:remove:remove": async () => {
                await this.awsProvider.remove();
                await this.netlifyProvider.remove();
            },
        };

        // TODO variables should be resolved just before deploying each provider
        // else we might get outdated values
        this.configurationVariablesSources = {
            // TODO these 2 variable sources should be merged eventually
            construct: {
                resolve: this.resolveVariable.bind(this),
            },
            reference: {
                resolve: this.resolveReference.bind(this),
            },
        };

        this.registerConfigSchema();
        this.loadComponents();
        this.registerCommands();
    }

    private registerConfigSchema() {
        const properties: { [k: string]: JSONSchema6Definition } = {};
        for (const [id, configuration] of Object.entries(this.normalizeConstructsConfig())) {
            properties[id] = componentsMap[configuration.type].schema as JSONSchema6Definition;
        }
        this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", {
            type: "object",
            properties: properties,
            additionalProperties: false,
        });
    }

    private loadComponents() {
        for (const [id, configuration] of Object.entries(this.normalizeConstructsConfig())) {
            this.loadComponent(id, componentsMap[configuration.type].class, configuration);
        }
    }

    protected loadComponent(id: string, type: any, configuration: unknown): void {
        // TODO type that more strongly
        if (type === NetlifyWebsite) {
            const component = new type(this.netlifyProvider, id, configuration) as NetlifyWebsite;
            this.components[id] = component;
            this.netlifyProvider.addComponent(id, component);
        } else {
            const component = new type(this.awsProvider, id, configuration) as AwsComponent<any>;
            this.components[id] = component;
            this.awsProvider.addComponent(id, component);
        }
    }

    async resolveVariable({ address }: { address: string }): Promise<{ value: string }> {
        const [id, property] = address.split(".", 2);

        if (!has(this.components, id)) {
            throw new Error(`No component named '${id}' found in service file.`);
        }
        const component = this.components[id];

        const properties = component.variables();
        if (!has(properties, property)) {
            throw new Error(
                `\${construct:${id}.${property}} does not exist. Properties available on \${construct:${id}} are: ${Object.keys(
                    properties
                ).join(", ")}.`
            );
        }

        // TODO: resolve value depending on the context:
        // - if it's a reference in the same stack, it should resolve to a CloudFormation reference
        // - if it's cross-stack, it should resolve to the real value
        return {
            value: (await properties[property]()) ?? "",
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

        // TODO: resolve value depending on the context:
        // - if it's a reference in the same stack, it should resolve to a CloudFormation reference
        // - if it's cross-stack, it should resolve to the real value
        return {
            value: properties[property](),
        };
    }

    async info(): Promise<void> {
        for (const [id, component] of Object.entries(this.components)) {
            const output = await component.infoOutput();
            if (output !== undefined) {
                console.log(chalk.yellow(`${id}: ${output}`));
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
    private normalizeConstructsConfig(): Record<string, { type: string; [k: string]: any }> {
        const serverlessConfig = (this.serverless.configurationInput as unknown) as Record<string, any>;
        const constructConfig: Record<string, { type: string; [k: string]: any }> = {};
        for (const [id, configuration] of Object.entries(serverlessConfig.constructs ?? {})) {
            if (!(configuration instanceof Object)) {
                continue;
            }
            if (!Object.prototype.hasOwnProperty.call(configuration, "type")) {
                continue;
            }
            const validConfig = configuration as { type: unknown };
            if (typeof validConfig.type === "string" && validConfig.type in componentsMap) {
                constructConfig[id] = validConfig as { type: string; [k: string]: any };
            }
        }

        return constructConfig;
    }
}

module.exports = LiftPlugin;
