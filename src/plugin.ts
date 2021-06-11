import { App, DefaultTokenResolver, Lazy, Stack, StringConcat } from "@aws-cdk/core";
import { get, has, merge } from "lodash";
import chalk from "chalk";
import { AwsIamPolicyStatements } from "@serverless/typescript";
import * as path from "path";
import { readFileSync } from "fs";
import { dump } from "js-yaml";
import { FromSchema } from "json-schema-to-ts";
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
import { allConstructs } from "./constructs";
import { log } from "./utils/logger";

const CONSTRUCTS_DEFINITION = {
    type: "object",
    patternProperties: {
        "^[a-zA-Z0-9-_]+$": {
            allOf: [
                {
                    // Replacing with a map on constructs values generates type (A | B | C)[] instead of A, B, C
                    anyOf: [
                        allConstructs.storage.schema,
                        allConstructs["static-website"].schema,
                        allConstructs.webhook.schema,
                        allConstructs.queue.schema,
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
    private constructs?: Record<string, Construct>;
    private readonly serverless: Serverless;
    private readonly app: App;
    // Only public to be used in tests
    public readonly stack: Stack;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver> = {};

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
            initialize: () => {
                this.loadConstructs();
                this.appendPermissions();
                this.resolveLazyTokens();
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
    }

    private registerConfigSchema() {
        this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", CONSTRUCTS_DEFINITION);
    }

    private loadConstructs(): Record<string, Construct> {
        if (this.constructs !== undefined) {
            // Safeguard
            throw new Error("Constructs are already initialized: this should not happen");
        }
        const awsProvider = new AwsProvider(this.serverless, this.stack);
        // @ts-ignore
        const constructsInputConfiguration = get(this.serverless.configurationInput, "constructs", {}) as FromSchema<
            typeof CONSTRUCTS_DEFINITION
        >;
        this.constructs = {};
        for (const [id, configuration] of Object.entries(constructsInputConfiguration)) {
            const constructConstructor = allConstructs[configuration.type].class;
            // Typescript cannot infer configuration specific to a type, thus computing intersetion of all configurations to never
            this.constructs[id] = new constructConstructor(awsProvider.stack, id, configuration as never, awsProvider);
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
             *   - CDK tokens are resolved into real value: we can now do that s
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
        // TODO we need to be able to register commands without having to boot constructs
        // WHY? Because commands MUST be registered in the plugin constructor, at which point
        // we don't have the constructs
        // for (const [id, construct] of Object.entries(this.constructs)) {
        //     const commands = construct.commands();
        //     for (const [command, handler] of Object.entries(commands)) {
        //         this.commands[`${id}:${command}`] = {
        //             lifecycleEvents: [command],
        //         };
        //         this.hooks[`${id}:${command}:${command}`] = handler;
        //     }
        // }
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

    private resolveLazyTokens() {
        const options = {
            resolver: new DefaultTokenResolver(new StringConcat()),
            scope: this.stack,
        };
        this.serverless.service.provider = Tokenization.resolve(this.serverless.service.provider, options);
        if (this.serverless.service.functions !== undefined) {
            this.serverless.service.functions = Tokenization.resolve(this.serverless.service.functions, options);
        }
        if (this.serverless.service.custom !== undefined) {
            this.serverless.service.custom = Tokenization.resolve(this.serverless.service.custom, options);
        }
        if (this.serverless.service.resources !== undefined) {
            this.serverless.service.resources = Tokenization.resolve(this.serverless.service.resources, options);
        }
        if (this.serverless.service.layers !== undefined) {
            this.serverless.service.layers = Tokenization.resolve(this.serverless.service.layers, options);
        }
        if (this.serverless.service.outputs !== undefined) {
            this.serverless.service.outputs = Tokenization.resolve(this.serverless.service.outputs, options);
        }
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
