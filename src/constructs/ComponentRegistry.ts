import { has } from "lodash";
import { JSONSchema } from "json-schema-to-ts";
import chalk from "chalk";
import { Storage, STORAGE_DEFINITION } from "./Storage";
import { CommandsDefinition, Hook, Serverless, VariableResolver } from "../types/serverless";
import { Component } from "./Component";
import { Queue, QUEUE_DEFINITION } from "./Queue";
import { STATIC_WEBSITE_DEFINITION, StaticWebsite } from "./StaticWebsite";

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
};

export class ComponentRegistry {
    private readonly components: Record<string, Component<any>> = {};
    private readonly serverless: Serverless;

    public readonly hooks: Record<string, Hook>;
    public commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver> = {};

    protected constructor(serverless: Serverless) {
        this.serverless = serverless;

        for (const [id, configuration] of Object.entries(serverless.configurationInput)) {
            if (
                configuration instanceof Object &&
                typeof configuration.type === "string" &&
                configuration.type in componentsMap
            ) {
                const type = componentsMap[configuration.type].class;
                const schema = componentsMap[configuration.type].schema;
                this.loadComponent(id, type, configuration, schema);
            }
        }

        this.hooks = {
            "before:aws:info:displayStackOutputs": this.info.bind(this),
            "deploy:deploy": this.deploy.bind(this),
            "remove:remove": this.remove.bind(this),
        };

        this.configurationVariablesSources = {
            reference: {
                resolve: this.resolveVariable.bind(this),
            },
        };

        this.registerCommands();
    }

    protected loadComponent(id: string, type: any, configuration: any, schema: JSONSchema): void {
        this.serverless.configSchemaHandler.defineTopLevelProperty(id, schema);
        this.components[id] = new type(this.serverless, id, configuration);
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
                `\${reference:${id}.${property}} does not exist. Properties available on \${reference:${id}} are: ${Object.keys(
                    properties
                ).join(", ")}.`
            );
        }

        return {
            value: (await properties[property]()) ?? "",
        };
    }

    // appendPermissions(): void {
    //     const statements = Object.entries(this.components)
    //         .map(([, component]) => (component.permissions() as unknown) as AwsIamPolicyStatements)
    //         .flat(1);
    //     if (statements.length === 0) {
    //         return;
    //     }
    //     this.serverless.service.provider.iamRoleStatements = this.serverless.service.provider.iamRoleStatements ?? [];
    //     this.serverless.service.provider.iamRoleStatements.push(...statements);
    // }

    async info(): Promise<void> {
        for (const [id, component] of Object.entries(this.components)) {
            const output = await component.infoOutput();
            if (output !== undefined) {
                console.log(chalk.yellow(`${id}: ${output}`));
            }
        }
    }

    async deploy(): Promise<void> {
        // TODO in correct order with object graph
        for (const [, component] of Object.entries(this.components)) {
            await component.deploy();
        }
    }

    async remove(): Promise<void> {
        // TODO in correct order with object graph
        for (const [, component] of Object.entries(this.components)) {
            await component.remove();
        }
    }

    private registerCommands() {
        for (const [id, component] of Object.entries(this.components)) {
            const commands = component.commands();
            if (Object.keys(commands).length > 0) {
                const allCommands: CommandsDefinition = {};
                for (const [command, handler] of Object.entries(commands)) {
                    allCommands[command] = {
                        lifecycleEvents: [command],
                    };
                    this.hooks[`${id}:${command}:${command}`] = handler;
                }
                this.commands[id] = {
                    commands: allCommands,
                };
            }
        }
    }
}
