import type { JSONSchema } from "json-schema-to-ts";
import type { AWS } from "@serverless/typescript";
import type { Stack } from "@aws-cdk/core";

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

export type Provider = {
    naming: {
        getStackName: () => string;
        getLambdaLogicalId: (functionName: string) => string;
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
    pluginManager: {
        addPlugin: (plugin: unknown) => void;
    };
    configSchemaHandler: {
        defineTopLevelProperty: (pluginName: string, schema: JSONSchema) => void;
    };
    configurationInput: AWS;
    service: AWS;
    getProvider: (provider: "aws") => Provider;
};

export type CloudformationTemplate = AWS["resources"];

export type CommandsDefinition = Record<string, { lifecycleEvents?: string[]; commands?: CommandsDefinition }>;
