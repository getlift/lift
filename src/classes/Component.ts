import { Construct } from "@aws-cdk/core";
import type { FromSchema, JSONSchema } from "json-schema-to-ts";
import { has } from "lodash";
import { AwsIamPolicyStatements } from "@serverless/typescript";
import type { CommandsDefinition, Hook, Serverless, VariableResolver } from "../types/serverless";
import { PolicyStatement } from "../Stack";

export abstract class Component<N extends string, S extends JSONSchema> extends Construct {
    protected readonly name: N;
    protected hooks: Record<string, Hook>;
    protected commands: CommandsDefinition = {};
    protected configurationVariablesSources: Record<string, VariableResolver> = {};
    protected serverless: Serverless;

    private hasComponentConfiguration(serviceDefinition: unknown): serviceDefinition is Record<N, FromSchema<S>> {
        return has(serviceDefinition, this.name);
    }

    getConfiguration(): FromSchema<S> | Record<string, never> {
        const serviceDefinition = this.serverless.configurationInput;
        if (this.hasComponentConfiguration(serviceDefinition)) {
            return serviceDefinition[this.name];
        }

        return {};
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

        this.hooks = {
            initialize: this.appendPermissions.bind(this),
        };
    }

    abstract compile(): void;

    appendPermissions(): void {
        const statements = (this.permissions() as unknown) as AwsIamPolicyStatements;
        if (statements.length === 0) {
            return;
        }
        this.serverless.service.provider.iamRoleStatements = this.serverless.service.provider.iamRoleStatements ?? [];
        this.serverless.service.provider.iamRoleStatements.push(...statements);
    }

    permissions(): PolicyStatement[] {
        return [];
    }

    protected getRegion(): string {
        return this.serverless.getProvider("aws").getRegion();
    }

    protected getStackName(): string {
        return this.serverless.getProvider("aws").naming.getStackName();
    }
}
