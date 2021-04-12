import type { FromSchema, JSONSchema } from "json-schema-to-ts";

export type Provider = {
    naming: {
        getStackName: () => string;
    };
    getRegion: () => string;
};

export class PolicyStatement {
    Effect = "Allow";
    Action: string | string[];
    Resource: string | Array<unknown>;
    constructor(Action: string | string[], Resource: string | Array<unknown>) {
        this.Action = Action;
        this.Resource = Resource;
    }
}

export type Serverless = {
    configSchemaHandler: {
        defineTopLevelProperty: (
            pluginName: string,
            schema: JSONSchema
        ) => void;
    };
    service: {
        custom?: {
            lift?: Record<string, unknown>;
        };
        provider: {
            vpc?: unknown;
            iamRoleStatements?: PolicyStatement[];
        };
        resources?: {
            Resources?: Record<string, unknown>;
            Outputs?: Record<string, unknown>;
        };
    } & Record<string, unknown>;
    getProvider: (provider: string) => Provider;
};

export abstract class Component<N extends string, S extends JSONSchema> {
    protected readonly name: N;
    protected serverless: Serverless;

    getConfiguration(): FromSchema<S> {
        return this.serverless.service[this.name] as FromSchema<S>;
    }

    getName(): N {
        return this.name;
    }

    protected constructor({
        serverless,
        name,
        schema,
    }: {
        serverless: Serverless;
        name: N;
        schema: S;
    }) {
        this.name = name;
        this.serverless = serverless;

        this.serverless.configSchemaHandler.defineTopLevelProperty(
            this.name,
            schema
        );
    }
}
