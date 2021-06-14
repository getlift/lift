import { get, has } from "lodash";
import chalk from "chalk";
import { AwsIamPolicyStatements } from "@serverless/typescript";
import * as path from "path";
import { readFileSync } from "fs";
import { dump } from "js-yaml";
import { FromSchema } from "json-schema-to-ts";
import type { CommandsDefinition, Hook, Serverless, VariableResolver } from "./types/serverless";
import Construct from "./classes/Construct";
import AwsProvider from "./classes/AwsProvider";
import { constructs } from "./constructs";
import { log } from "./utils/logger";

const CONSTRUCTS_DEFINITION = {
    type: "object",
    patternProperties: {
        "^[a-zA-Z0-9-_]+$": {
            type: "object",
            properties: {
                type: { type: "string" },
            },
            required: ["type"],
        },
    },
    additionalProperties: false,
} as const;

/**
 * Serverless plugin
 */
class LiftPlugin {
    private readonly constructs: Record<string, Construct> = {};
    private readonly serverless: Serverless;
    // Only used to generate Cloudformation resource and insert them in there. Can be removed later.
    private readonly awsProvider: AwsProvider;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver> = {};

    constructor(serverless: Serverless) {
        this.serverless = serverless;

        this.commands.lift = {
            commands: {
                eject: {
                    lifecycleEvents: ["eject"],
                },
            },
        };

        this.hooks = {
            initialize: this.appendPermissions.bind(this),
            "before:aws:info:displayStackOutputs": this.info.bind(this),
            "after:package:compileEvents": this.appendCloudformationResources.bind(this),
            "after:deploy:deploy": this.postDeploy.bind(this),
            "before:remove:remove": this.preRemove.bind(this),
            "lift:eject:eject": this.eject.bind(this),
        };

        // TODO variables should be resolved just before deploying each provider
        // else we might get outdated values
        this.configurationVariablesSources = {
            // TODO these 2 variable sources should be merged eventually
            construct: {
                resolve: this.resolveReference.bind(this),
            },
        };

        this.awsProvider = new AwsProvider(this.serverless);
        this.registerConfigSchema();
        this.loadConstructs();
        this.registerCommands();
    }

    private registerConfigSchema() {
        this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", CONSTRUCTS_DEFINITION);
    }

    private loadConstructs() {
        const constructsInputConfiguration = get(this.serverless.configurationInput, "constructs", {}) as FromSchema<
            typeof CONSTRUCTS_DEFINITION
        >;
        for (const [id, configuration] of Object.entries(constructsInputConfiguration)) {
            this.constructs[id] = this.awsProvider.registerConstruct(id, configuration);
        }
    }

    resolveReference({ address }: { address: string }): { value: Record<string, unknown> } {
        const [id, property] = address.split(".", 2);
        if (!has(this.constructs, id)) {
            throw new Error(
                `No construct named '${id}' was found, the \${construct:${id}.${property}} variable is invalid.`
            );
        }
        const construct = this.constructs[id];

        const properties = construct.references();
        if (!has(properties, property)) {
            throw new Error(
                `\${construct:${id}.${property}} does not exist. Properties available on \${construct:${id}} are: ${Object.keys(
                    properties
                ).join(", ")}.`
            );
        }

        return {
            value: properties[property],
        };
    }

    async info(): Promise<void> {
        for (const [id, construct] of Object.entries(this.constructs)) {
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
        for (const [id, construct] of Object.entries(this.constructs)) {
            const commands = construct.commands();
            for (const [command, handler] of Object.entries(commands)) {
                this.commands[`${id}:${command}`] = {
                    lifecycleEvents: [command],
                };
                this.hooks[`${id}:${command}:${command}`] = handler;
            }
        }
    }

    private async postDeploy(): Promise<void> {
        for (const [, construct] of Object.entries(this.constructs)) {
            if (construct.postDeploy !== undefined) {
                await construct.postDeploy();
            }
        }
    }

    private async preRemove(): Promise<void> {
        for (const [, construct] of Object.entries(this.constructs)) {
            if (construct.preRemove !== undefined) {
                await construct.preRemove();
            }
        }
    }

    private appendCloudformationResources() {
        this.awsProvider.appendCloudformationResources();
    }

    private appendPermissions(): void {
        const statements = Object.entries(this.constructs)
            .map(([, construct]) => {
                return ((construct.permissions ? construct.permissions() : []) as unknown) as AwsIamPolicyStatements;
            })
            .flat(1);
        if (statements.length === 0) {
            return;
        }
        this.serverless.service.provider.iamRoleStatements = this.serverless.service.provider.iamRoleStatements ?? [];
        this.serverless.service.provider.iamRoleStatements.push(...statements);
    }

    private async eject() {
        log("Ejecting from Lift to CloudFormation");
        await this.serverless.pluginManager.spawn("package");
        const legacyProvider = this.serverless.getProvider("aws");
        const compiledTemplateFileName = legacyProvider.naming.getCompiledTemplateFileName();
        const compiledTemplateFilePath = path.join(this.serverless.serviceDir, ".serverless", compiledTemplateFileName);
        const cfTemplate = readFileSync(compiledTemplateFilePath);
        const formattedYaml = dump(JSON.parse(cfTemplate.toString()));
        console.log(formattedYaml);
        log("You can also find that CloudFormation template in the following file:");
        log(compiledTemplateFilePath);
    }
}

module.exports = LiftPlugin;
