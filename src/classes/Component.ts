import { Construct } from "@aws-cdk/core";
import type { FromSchema, JSONSchema } from "json-schema-to-ts";
import type { CommandsDefinition, Hook, Serverless, VariableResolver } from "../types/serverless";

export abstract class Component<N extends string, S extends JSONSchema> extends Construct {
    protected readonly name: N;
    protected hooks: Record<string, Hook> = {};
    protected commands: CommandsDefinition = {};
    protected configurationVariablesSources: Record<string, VariableResolver> = {};
    protected serverless: Serverless;

    getConfiguration(): FromSchema<S> | undefined {
        return ((this.serverless.configurationInput as unknown) as Record<N, FromSchema<S>>)[this.name];
    }

    getName(): N {
        return this.name;
    }

    protected constructor({ serverless, name, schema }: { serverless: Serverless; name: N; schema: S }) {
        super(serverless.stack, name);
        this.name = name;
        this.serverless = serverless;

        this.serverless.configSchemaHandler.defineTopLevelProperty(this.name, schema);

        // At the moment, no hook is triggered soon enough to be able to compile component configuration into actual components before fwk validation
        this.compile();
    }

    abstract compile(): void;

    protected getRegion(): string {
        return this.serverless.getProvider("aws").getRegion();
    }

    protected getStackName(): string {
        return this.serverless.getProvider("aws").naming.getStackName();
    }
}
