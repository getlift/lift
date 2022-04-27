import { flatten, get, has, merge } from "lodash";
import type { AwsIamPolicyStatements } from "@serverless/typescript";
import * as path from "path";
import { readFileSync } from "fs";
import { dump } from "js-yaml";
import { DefaultTokenResolver, Lazy, StringConcat, Tokenization } from "aws-cdk-lib";
import type { FromSchema } from "json-schema-to-ts";
import type { ProviderInterface, StaticProviderInterface } from "@lift/providers";
import { AwsProvider, StripeProvider } from "@lift/providers";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import chalk from "chalk";
import type {
    CommandsDefinition,
    DeprecatedVariableResolver,
    Hook,
    Serverless,
    VariableResolver,
} from "./types/serverless";
import type { ServerlessUtils } from "./utils/logger";
import { getUtils, setUtils } from "./utils/logger";
import ServerlessError from "./utils/error";

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
type LiftConfig = FromSchema<typeof LIFT_CONFIG_SCHEMA>;

/**
 * Serverless plugin
 */
class LiftPlugin {
    private constructs?: Record<string, ConstructInterface>;
    private providers: Record<string, ProviderInterface>;
    private readonly serverless: Serverless;
    private static readonly providerClasses: Record<string, StaticProviderInterface> = {};
    private readonly providersSchema = PROVIDERS_DEFINITION;
    private readonly constructsSchema = CONSTRUCTS_DEFINITION;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};
    public readonly configurationVariablesSources: Record<string, VariableResolver>;
    public readonly variableResolvers: Record<string, DeprecatedVariableResolver>;
    private readonly cliOptions: Record<string, string>;

    constructor(serverless: Serverless, cliOptions: Record<string, string>, utils?: ServerlessUtils) {
        this.serverless = serverless;
        setUtils(utils);

        // This method is exposed for Lift tests only, it is not a public API
        Object.assign(this.serverless, { getLiftProviderById: this.getLiftProviderById.bind(this) });
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

        this.providers = { [DEFAULT_PROVIDER]: new AwsProvider(this.serverless) };
        this.loadProviders();
        this.registerConstructsSchema();
        this.registerProvidersSchema();
        this.registerConfigSchema();
        this.registerCommands();
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
            oneOf: LiftPlugin.getAllProviderClasses().map((Provider) => {
                return this.defineSchemaWithType(Provider.type, Provider.schema);
            }),
        });
    }

    private defineSchemaWithType(type: string, configSchema: Record<string, unknown>): Record<string, unknown> {
        return merge({}, configSchema, { properties: { type: { const: type } } });
    }

    private registerConfigSchema() {
        this.serverless.configSchemaHandler.defineTopLevelProperty("lift", LIFT_CONFIG_SCHEMA);
        this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", this.constructsSchema);
        this.serverless.configSchemaHandler.defineTopLevelProperty("providers", this.providersSchema);
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
        const providersInputConfiguration = get(this.serverless.configurationInput, "providers", {});
        for (const [id, { type }] of Object.entries(providersInputConfiguration)) {
            this.providers[id] = this.createProvider(type, id);
        }
    }

    private createProvider(type: string, id: string): ProviderInterface {
        if (type === AwsProvider.type) {
            throw new ServerlessError(
                "AwsProvider is not configurable via providers",
                "LIFT_AWS_PROVIDER_CONFIGURATION"
            );
        }
        const Provider = LiftPlugin.getProviderClass(type);
        if (Provider === undefined) {
            throw new ServerlessError(
                `The provider '${id}' has an unknown type '${type}'`,
                "LIFT_UNKNOWN_PROVIDER_TYPE"
            );
        }
        const configuration = get(this.serverless.configurationInput.providers, id, {});

        return Provider.create(this.serverless, id, configuration);
    }

    private loadConstructs(): void {
        if (this.constructs !== undefined) {
            // Safeguard
            throw new Error("Constructs are already initialized: this should not happen");
        }
        this.constructs = {};
        const constructsInputConfiguration = get(this.serverless.configurationInput, "constructs", {});
        for (const [id, { type, provider: providerId }] of Object.entries(constructsInputConfiguration)) {
            // Legacy behavior -> defaults to Serverless framework AWS provider
            if (providerId === undefined) {
                this.constructs[id] = this.providers[DEFAULT_PROVIDER].createConstruct(type, id);
                continue;
            }
            const provider = this.getLiftProviderById(providerId);
            if (!provider) {
                throw new ServerlessError(
                    `No provider ${providerId} was found for construct ${id}. Available providers are ${Object.keys(
                        this.providers
                    ).join(", ")}`,
                    "LIFT_UNKNOWN_PROVIDER_ID"
                );
            }
            this.constructs[id] = provider.createConstruct(type, id);
        }
    }

    private getConstructs(): Record<string, ConstructInterface> {
        if (this.constructs === undefined) {
            // Safeguard
            throw new Error("Constructs are not initialized: this should not happen");
        }

        return this.constructs;
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
            if (Object.keys(outputs).length === 1) {
                const resolver = Object.values(outputs)[0];
                const output = await resolver();
                if (output !== undefined) {
                    if (this.serverless.addServiceOutputSection) {
                        this.serverless.addServiceOutputSection(id, output);
                    } else {
                        console.log(`${chalk.yellow(`${id}:`)} ${output}`);
                    }
                }
            }
            if (Object.keys(outputs).length > 1) {
                const content: string[] = [];
                for (const [name, resolver] of Object.entries(outputs)) {
                    const output = await resolver();
                    if (output !== undefined) {
                        content.push(`${name}: ${output}`);
                    }
                }
                if (this.serverless.addServiceOutputSection) {
                    this.serverless.addServiceOutputSection(id, content);
                } else {
                    console.log(chalk.yellow(`${id}:`));
                    console.log(content.map((line) => `  ${line}`).join(`\n`));
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
                scope: (this.providers[DEFAULT_PROVIDER] as AwsProvider).stack,
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

    // This is only required for AwsProvider in order to bundle resources together with existing SLS framework resources
    private appendCloudformationResources() {
        (this.providers[DEFAULT_PROVIDER] as AwsProvider).appendCloudformationResources();
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
        getUtils().log("Ejecting from Lift to CloudFormation");
        getUtils().log();
        await this.serverless.pluginManager.spawn("package");
        const legacyProvider = this.serverless.getProvider("aws");
        const compiledTemplateFileName = legacyProvider.naming.getCompiledTemplateFileName();
        const compiledTemplateFilePath = path.join(this.serverless.serviceDir, ".serverless", compiledTemplateFileName);
        const cfTemplate = readFileSync(compiledTemplateFilePath);
        const formattedYaml = dump(JSON.parse(cfTemplate.toString()));
        getUtils().writeText(formattedYaml);
        getUtils().log("You can also find that CloudFormation template in the following file:");
        getUtils().log(compiledTemplateFilePath);
    }

    private getAllConstructClasses(): StaticConstructInterface[] {
        const result = flatten(
            LiftPlugin.getAllProviderClasses().map((providerClass) => providerClass.getAllConstructClasses())
        );

        return result;
    }

    private getConstructClass(constructType: string): StaticConstructInterface | undefined {
        for (const providerClass of LiftPlugin.getAllProviderClasses()) {
            const constructClass = providerClass.getConstructClass(constructType);
            if (constructClass !== undefined) {
                return constructClass;
            }
        }

        return undefined;
    }
}

export type Lift = {
    constructs: FromSchema<typeof CONSTRUCTS_DEFINITION>;
};

LiftPlugin.registerProviders(AwsProvider, StripeProvider);

module.exports = LiftPlugin;
