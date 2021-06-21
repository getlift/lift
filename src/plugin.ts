import { App, Stack } from "@aws-cdk/core";
import { flatten, get, has, merge } from "lodash";
import chalk from "chalk";
import { AwsIamPolicyStatements } from "@serverless/typescript";
import * as path from "path";
import { readFileSync } from "fs";
import { dump } from "js-yaml";
import { FromSchema } from "json-schema-to-ts";
import type {
    CloudformationTemplate,
    CommandsDefinition,
    DeprecatedVariableResolver,
    Hook,
    Serverless,
    VariableResolver,
} from "./types/serverless";
import Construct from "./classes/Construct";
import AwsProvider from "./classes/AwsProvider";
import { constructs } from "./constructs";
import { log } from "./utils/logger";
import ServerlessError from "./utils/error";

const CONSTRUCTS_DEFINITION = {
    type: "object",
    patternProperties: {
        "^[a-zA-Z0-9-_]+$": {
            allOf: [
                {
                    // Replacing with a map on constructs values generates type (A | B | C)[] instead of A, B, C
                    anyOf: [
                        constructs.storage.schema,
                        constructs["static-website"].schema,
                        constructs.webhook.schema,
                        constructs.queue.schema,
                    ],
                },
                {
                    type: "object",
                    properties: {
                        type: { type: "string" },
                    },
                    required: ["type"],
                },
            ],
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
    private readonly app: App;
    // Only public to be used in tests
    public readonly stack: Stack;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver>;
    public readonly variableResolvers: Record<string, DeprecatedVariableResolver>;

    constructor(serverless: Serverless) {
        this.app = new App();
        this.stack = new Stack(this.app);
        serverless.stack = this.stack;

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

        this.configurationVariablesSources = {
            construct: {
                resolve: this.resolveReference.bind(this),
            },
        };
        this.variableResolvers = {
            construct: (fullVariable) => {
                const address = fullVariable.split(":")[1];

                return Promise.resolve(this.resolveReference({ address }).value);
            },
        };

        this.registerConfigSchema();
        this.loadConstructs();
        this.registerCommands();
    }

    private registerConfigSchema() {
        this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", CONSTRUCTS_DEFINITION);
    }

    private loadConstructs() {
        const awsProvider = new AwsProvider(this.serverless, this.stack);
        const constructsInputConfiguration = get(this.serverless.configurationInput, "constructs", {}) as FromSchema<
            typeof CONSTRUCTS_DEFINITION
        >;
        for (const [id, configuration] of Object.entries(constructsInputConfiguration)) {
            if (!has(constructs, configuration.type)) {
                throw new ServerlessError(
                    `The construct '${id}' has an unknown type '${configuration.type}'\n` +
                        "Find all construct types available here: https://github.com/getlift/lift#constructs",
                    "LIFT_UNKNOWN_CONSTRUCT_TYPE"
                );
            }
            const constructConstructor = constructs[configuration.type].class;
            // Typescript cannot infer configuration specific to a type, thus computing intersetion of all configurations to never
            this.constructs[id] = new constructConstructor(awsProvider.stack, id, configuration as never, awsProvider);
        }
    }

    resolveReference({ address }: { address: string }): { value: Record<string, unknown> } {
        const [id, property] = address.split(".", 2);
        if (!has(this.constructs, id)) {
            throw new ServerlessError(
                `No construct named '${id}' was found, the \${construct:${id}.${property}} variable is invalid.`,
                "LIFT_VARIABLE_UNKNOWN_CONSTRUCT"
            );
        }
        const construct = this.constructs[id];

        const properties = construct.references();
        if (!has(properties, property)) {
            throw new ServerlessError(
                `\${construct:${id}.${property}} does not exist. Properties available on \${construct:${id}} are: ${Object.keys(
                    properties
                ).join(", ")}.`,
                "LIFT_VARIABLE_UNKNOWN_PROPERTY"
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
        merge(this.serverless.service, {
            resources: this.app.synth().getStackByName(this.stack.stackName).template as CloudformationTemplate,
        });
    }

    private appendPermissions(): void {
        const statements = flatten(
            Object.entries(this.constructs).map(([, construct]) => {
                return ((construct.permissions ? construct.permissions() : []) as unknown) as AwsIamPolicyStatements;
            })
        );
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
