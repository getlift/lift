import { flatten, get, has, merge } from "lodash";
import chalk from "chalk";
import type { AwsIamPolicyStatements } from "@serverless/typescript";
import * as path from "path";
import { readFileSync } from "fs";
import { dump } from "js-yaml";
import { DefaultTokenResolver, Lazy, StringConcat, Tokenization } from "@aws-cdk/core";
import type { FromSchema } from "json-schema-to-ts";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import { NetlifyWebsite } from "@lift/constructs/netlify/NetlifyWebsite";
import { AwsProvider } from "@lift/providers";
import type {
    CommandsDefinition,
    DeprecatedVariableResolver,
    Hook,
    Serverless,
    VariableResolver,
} from "./types/serverless";
import { log } from "./utils/logger";
import ServerlessError from "./utils/error";
import { CdkDeploy } from "./plugins/CdkDeploy";
import { CdkPackage } from "./plugins/CdkPackage";
import { CdkInfo } from "./plugins/CdkInfo";

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
type LiftConfig = FromSchema<typeof LIFT_CONFIG_SCHEMA>;

/**
 * Serverless plugin
 */
export class LiftPlugin {
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

    private constructs?: Record<string, ConstructInterface>;
    private readonly serverless: Serverless;
    private readonly constructsSchema = CONSTRUCTS_DEFINITION;
    private readonly awsProvider: AwsProvider;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver>;
    public readonly variableResolvers: Record<string, DeprecatedVariableResolver>;
    private readonly cliOptions: Record<string, string>;

    constructor(serverless: Serverless, cliOptions: Record<string, string>) {
        this.serverless = serverless;
        this.cliOptions = cliOptions;

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

        this.awsProvider = new AwsProvider(this.serverless);
        serverless.setProvider("aws-cdk", this.awsProvider);
        serverless.pluginManager.addPlugin(CdkPackage);
        serverless.pluginManager.addPlugin(CdkDeploy);
        serverless.pluginManager.addPlugin(CdkInfo);

        this.registerConstructsSchema();
        this.registerConfigSchema();
        this.registerCommands();
    }

    private registerConstructsSchema() {
        const constructClasses = [...LiftPlugin.getAllConstructClasses(), ...AwsProvider.getAllConstructClasses()];

        (
            this.constructsSchema.patternProperties[CONSTRUCT_ID_PATTERN].allOf as unknown as Record<string, unknown>[]
        ).push({
            oneOf: constructClasses.map((Construct) => {
                return this.defineSchemaWithType(Construct.type, Construct.schema);
            }),
        });
    }

    private defineSchemaWithType(type: string, configSchema: Record<string, unknown>): Record<string, unknown> {
        return merge(configSchema, { properties: { type: { const: type } } });
    }

    private registerConfigSchema() {
        this.serverless.configSchemaHandler.defineTopLevelProperty("lift", LIFT_CONFIG_SCHEMA);
        this.serverless.configSchemaHandler.defineProvider("aws-cdk", {
            constructs: this.constructsSchema,
        });
        this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", this.constructsSchema);
    }

    private loadConstructs(): void {
        if (this.constructs !== undefined) {
            // Safeguard
            throw new Error("Constructs are already initialized: this should not happen");
        }
        this.constructs = {};
        const constructsInputConfiguration = get(this.serverless.configurationInput, "constructs", {});
        for (const [id, configuration] of Object.entries(constructsInputConfiguration)) {
            this.constructs[id] = this.createConstruct(configuration.type, id, configuration);
        }
    }

    getConstructClass(id: string, type: string): StaticConstructInterface {
        let constructClass = LiftPlugin.getConstructClass(type);
        if (constructClass !== undefined) {
            return constructClass;
        }
        // Fallback to AWS constructs
        constructClass = AwsProvider.getConstructClass(type);
        if (constructClass === undefined) {
            throw new ServerlessError(
                `The construct '${id}' has an unknown type '${type}'\n` +
                    "Find all construct types available here: https://github.com/getlift/lift#constructs",
                "LIFT_UNKNOWN_CONSTRUCT_TYPE"
            );
        }

        return constructClass;
    }

    createConstruct(type: string, id: string, configuration: Record<string, unknown>): ConstructInterface {
        const Construct = LiftPlugin.getConstructClass(type);
        if (Construct !== undefined) {
            return Construct.create(id, configuration);
        }

        // Fallback to AWS constructs
        return this.awsProvider.createConstruct(type, id, configuration);
    }

    private getConstructs(): Record<string, ConstructInterface> {
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
                    if (!has(this.constructs, id)) {
                        throw new ServerlessError(
                            `No construct named '${id}' was found, the \${construct:${id}.${property}} variable is invalid.`,
                            "LIFT_VARIABLE_UNKNOWN_CONSTRUCT"
                        );
                    }
                    const construct = constructs[id];

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
        const constructs = this.getConstructs();
        for (const [id, construct] of Object.entries(constructs)) {
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
        const constructsConfiguration = get(this.serverless.configurationInput, "constructs", {}) as Record<
            string,
            { type?: string }
        >;
        // For each construct
        for (const [id, constructConfig] of Object.entries(constructsConfiguration)) {
            if (constructConfig.type === undefined) {
                throw new ServerlessError(
                    `The construct '${id}' has no 'type' defined.\n` +
                        "Find all construct types available here: https://github.com/getlift/lift#constructs",
                    "LIFT_MISSING_CONSTRUCT_TYPE"
                );
            }
            const constructClass = this.getConstructClass(id, constructConfig.type);
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
                scope: this.awsProvider.stack,
            }) as T;
        };
        this.serverless.service.provider = resolveTokens(this.serverless.service.provider);
        this.serverless.service.package = resolveTokens(this.serverless.service.package);
        this.serverless.service.custom = resolveTokens(this.serverless.service.custom);
        this.serverless.service.resources = resolveTokens(this.serverless.service.resources);
        this.serverless.service.functions = resolveTokens(this.serverless.service.functions);
        this.serverless.service.layers = resolveTokens(this.serverless.service.layers);
        this.serverless.service.outputs = resolveTokens(this.serverless.service.outputs);
        // Also resolve tokens in `configurationInput` because they also appear in there
        this.serverless.configurationInput = resolveTokens(this.serverless.configurationInput);
    }

    private appendPermissions(): void {
        // Automatic permissions can be disabled via a `lift.automaticPermissions` flag in serverless.yml
        const liftConfiguration = get(this.serverless.configurationInput, "lift", {}) as LiftConfig;
        if (liftConfiguration.automaticPermissions === false) {
            return;
        }

        const constructs = this.getConstructs();
        const statements = flatten(
            Object.entries(constructs).map(([, construct]) => {
                return (construct.permissions ? construct.permissions() : []) as unknown as AwsIamPolicyStatements;
            })
        );
        if (statements.length === 0) {
            return;
        }

        const role = this.serverless.service.provider.iam?.role;

        if (typeof role === "object" && "statements" in role) {
            role.statements?.push(...statements);

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

export type Lift = {
    constructs: FromSchema<typeof CONSTRUCTS_DEFINITION>;
};

LiftPlugin.registerConstructs(NetlifyWebsite);

module.exports = LiftPlugin;
