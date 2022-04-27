import type { AWS } from "@serverless/typescript";
import type { Stack } from "aws-cdk-lib";

export type Hook = () => void | Promise<void>;

export type VariableResolver = {
    /**
     * When using such expression in service file ${foo(param1, param2):address}, resolve will be invoked with the following values:
     *  - address: address
     *  - params: [param1, param2]
     *  - resolveConfigurationProperty: use to resolve other parts of the service file. Usage: `await resolveConfigurationProperty(["provider", "stage"])` will resolve provider.stage value
     *  - options: CLI options passed to the command
     */
    resolve: (context: {
        address: string;
        params: string[];
        resolveConfigurationProperty: string;
        options: Record<string, string>;
    }) => { value: string | Record<string, unknown> } | Promise<{ value: string | Record<string, unknown> }>;
};
export type DeprecatedVariableResolver = (variable: string) => Promise<string | Record<string, unknown>>;

export type Provider = {
    naming: {
        getStackName: () => string;
        getLambdaLogicalId: (functionName: string) => string;
        getRestApiLogicalId: () => string;
        getHttpApiLogicalId: () => string;
        getCompiledTemplateFileName: () => string;
    };
    getRegion: () => string;
    /**
     * Send a request to the AWS API.
     */
    request: <Input, Output>(service: string, method: string, params: Input) => Promise<Output>;
};

export type Serverless = {
    // To use only in tests
    stack: Stack;
    serviceDir: string;
    pluginManager: {
        addPlugin: (plugin: unknown) => void;
        spawn: (command: string) => Promise<void>;
    };
    configSchemaHandler: {
        defineTopLevelProperty: (pluginName: string, schema: Record<string, unknown>) => void;
    };
    configurationInput: AWS & {
        constructs?: Record<string, { type: string; provider?: string }>;
        providers?: Record<string, { type: string }>;
    };
    service: AWS & {
        setFunctionNames(rawOptions: Record<string, unknown>): void;
    };
    processedInput: {
        commands: unknown;
        options: Record<string, unknown>;
    };
    getProvider: (provider: "aws") => Provider;
    addServiceOutputSection?(section: string, content: string | string[]): void;
};

export type CloudformationTemplate = AWS["resources"];

export type CommandsDefinition = Record<
    string,
    {
        lifecycleEvents?: string[];
        commands?: CommandsDefinition;
        usage?: string;
        options?: {
            [name: string]: {
                usage: string;
                required?: boolean;
                shortcut?: string;
            };
        };
    }
>;

export type CliOptions = Record<string, string | boolean | string[]>;
