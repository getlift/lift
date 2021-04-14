import type { JSONSchema } from "json-schema-to-ts";
import type { AWS } from "@serverless/typescript";
import type { Stack } from "@aws-cdk/core";

export type Provider = {
    naming: {
        getStackName: () => string;
    };
    getRegion: () => string;
};

export type Serverless = {
    stack: Stack;
    pluginManager: {
        addPlugin: (plugin: unknown) => void;
    };
    configSchemaHandler: {
        defineTopLevelProperty: (
            pluginName: string,
            schema: JSONSchema
        ) => void;
    };
    configurationInput: AWS;
    service: AWS & {
        custom?: {
            lift?: Record<string, unknown>;
        };
    };
    getProvider: (provider: "aws") => Provider;
};
