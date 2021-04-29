import { CfnOutput, Construct, Stack } from "@aws-cdk/core";
import type { FromSchema, JSONSchema } from "json-schema-to-ts";
import { has } from "lodash";
import { AwsIamPolicyStatements } from "@serverless/typescript";
import type { CommandsDefinition, Hook, Serverless, VariableResolver } from "../types/serverless";
import { PolicyStatement } from "../Stack";
import { getStackOutput } from "../CloudFormation";

export abstract class Component<N extends string, S extends JSONSchema> extends Construct {
    protected readonly name: N;
    protected hooks: Record<string, Hook>;
    protected commands: CommandsDefinition = {};
    protected configurationVariablesSources: Record<string, VariableResolver> = {};
    protected serverless: Serverless;

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

    protected getConfiguration(): FromSchema<S> | Record<string, never> {
        const serviceDefinition = this.serverless.configurationInput;
        if (this.hasComponentConfiguration(serviceDefinition)) {
            return serviceDefinition[this.name];
        }

        return {};
    }

    protected getName(): N {
        return this.name;
    }

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

    private hasComponentConfiguration(serviceDefinition: unknown): serviceDefinition is Record<N, FromSchema<S>> {
        return has(serviceDefinition, this.name);
    }
}

export abstract class ComponentConstruct extends Construct {
    readonly id: string;
    protected readonly stackName: string;
    protected readonly serverless: Serverless;

    protected constructor(scope: Construct, id: string, serverless: Serverless) {
        super(scope, id);
        this.id = id;
        this.serverless = serverless;
        this.stackName = serverless.getProvider("aws").naming.getStackName();
    }

    /**
     * Returns a CloudFormation intrinsic function, like Fn::Ref, GetAtt, etc.
     */
    protected getCloudFormationReference(value: string): Record<string, unknown> {
        return Stack.of(this).resolve(value) as Record<string, unknown>;
    }

    protected async getOutputValue(output: CfnOutput): Promise<string | undefined> {
        return await getStackOutput(this.serverless, Stack.of(this).resolve(output.logicalId));
    }
}
