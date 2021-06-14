import { App, DefaultTokenResolver, Lazy, Stack, StringConcat } from "@aws-cdk/core";
import { get, has, merge } from "lodash";
import chalk from "chalk";
import { AwsIamPolicyStatements } from "@serverless/typescript";
import * as path from "path";
import { readFileSync } from "fs";
import { dump } from "js-yaml";
import { JSONSchema } from "json-schema-to-ts";
import { Tokenization } from "@aws-cdk/core/lib/token";
import type {
    CloudformationTemplate,
    CommandsDefinition,
    Hook,
    Serverless,
    VariableResolver,
} from "./types/serverless";
import Construct from "./classes/Construct";
import AwsProvider from "./classes/AwsProvider";
import { constructDefinitions } from "./constructs";
import { log } from "./utils/logger";

const CONSTRUCTS_DEFINITION = {
    type: "object",
    patternProperties: {
        "^[a-zA-Z0-9-_]+$": {
            allOf: [
                {
                    // Replacing with a map on constructs values generates type (A | B | C)[] instead of A, B, C
                    anyOf: Object.values(constructDefinitions).map((definition) => definition.schema),
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
    private constructs?: Record<string, Construct>;
    private readonly serverless: Serverless;
    private readonly app: App;
    // Only public to be used in tests
    public readonly stack: Stack;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver> = {};
    private readonly cliOptions: Record<string, string>;

    constructor(serverless: Serverless, cliOptions: Record<string, string>) {
        this.cliOptions = cliOptions;
        this.app = new App();
        this.stack = new Stack(this.app);
        serverless.stack = this.stack;

        this.serverless = serverless;

        this.commands.lift = {
            commands: {
                eject: {
                    usage: "Eject Lift constructs to raw CloudFormation",
                    lifecycleEvents: ["eject"],
                },
            },
        };

        this.hooks = {
            initialize: () => {
                this.loadConstructs();
                this.appendPermissions();
                this.resolveLazyVariables();
            },
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

        this.registerConfigSchema();
        this.registerCommands();
    }

    private registerConfigSchema() {
        this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", CONSTRUCTS_DEFINITION as JSONSchema);
    }

    private loadConstructs(): Record<string, Construct> {
        if (this.constructs !== undefined) {
            // Safeguard
            throw new Error("Constructs are already initialized: this should not happen");
        }
        const constructsInputConfiguration = get(this.serverless.configurationInput, "constructs", {}) as Record<
            string,
            { type: string }
        >;
        const awsProvider = new AwsProvider(this.serverless, this.stack);
        this.constructs = {};
        for (const [id, configuration] of Object.entries(constructsInputConfiguration)) {
            const constructDefinition = constructDefinitions[configuration.type];
            this.constructs[id] = constructDefinition.create(id, configuration, awsProvider);
        }

        return this.constructs;
    }

    private getConstructs(): Record<string, Construct> {
        if (this.constructs === undefined) {
            // Safeguard
            throw new Error("Constructs are not initialized: this should not happen");
        }

        return this.constructs;
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
                    const constructs = this.getConstructs();
                    const [id, property] = address.split(".", 2);
                    if (!has(constructs, id)) {
                        throw new Error(
                            `No construct named '${id}' was found, the \${construct:${id}.${property}} variable is invalid.`
                        );
                    }
                    const construct = constructs[id];

                    const properties = construct.references();
                    if (!has(properties, property)) {
                        throw new Error(
                            `\${construct:${id}.${property}} does not exist. Properties available on \${construct:${id}} are: ${Object.keys(
                                properties
                            ).join(", ")}.`
                        );
                    }

                    return properties[property];
                },
            }).toString(),
        };
    }

    async info(): Promise<void> {
        const constructs = this.getConstructs();
        for (const [id, construct] of Object.entries(constructs)) {
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
        const constructsConfiguration = get(this.serverless.configurationInput, "constructs", {}) as Record<
            string,
            { type: string }
        >;
        // For each construct
        for (const [id, constructConfig] of Object.entries(constructsConfiguration)) {
            const constructDefinition = constructDefinitions[constructConfig.type];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (constructDefinition === undefined) {
                throw new Error(`Construct ${id} has an unknown type ${constructConfig.type}`);
            }
            // For each command of the construct
            for (const [command, commandConfig] of Object.entries(constructDefinition.commands ?? {})) {
                this.commands[`${id}:${command}`] = {
                    lifecycleEvents: [command],
                    usage: commandConfig.usage,
                    options: commandConfig.options,
                };
                // Register the command handler
                this.hooks[`${id}:${command}:${command}`] = () => {
                    // We resolve the construct instance on the fly
                    const construct = this.getConstructs()[id];

                    return commandConfig.handler.call(construct, this.cliOptions);
                };
            }
        }
    }

    private async postDeploy(): Promise<void> {
        const constructs = this.getConstructs();
        for (const [, construct] of Object.entries(constructs)) {
            if (construct.postDeploy !== undefined) {
                await construct.postDeploy();
            }
        }
    }

    private async preRemove(): Promise<void> {
        const constructs = this.getConstructs();
        for (const [, construct] of Object.entries(constructs)) {
            if (construct.preRemove !== undefined) {
                await construct.preRemove();
            }
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
                scope: this.stack,
            }) as T;
        };
        this.serverless.service.provider = resolveTokens(this.serverless.service.provider);
        this.serverless.service.functions = resolveTokens(this.serverless.service.functions);
        this.serverless.service.custom = resolveTokens(this.serverless.service.custom);
        this.serverless.service.resources = resolveTokens(this.serverless.service.resources);
        this.serverless.service.layers = resolveTokens(this.serverless.service.layers);
        this.serverless.service.outputs = resolveTokens(this.serverless.service.outputs);
    }

    private appendCloudformationResources() {
        merge(this.serverless.service, {
            resources: this.app.synth().getStackByName(this.stack.stackName).template as CloudformationTemplate,
        });
    }

    private appendPermissions(): void {
        const constructs = this.getConstructs();
        const statements = Object.entries(constructs)
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
