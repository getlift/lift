import { CfnOutput, Construct, Stack } from "@aws-cdk/core";
import { FromSchema, JSONSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";
import { CommandsDefinition } from "../types/serverless";
import { PolicyStatement } from "../Stack";
import { getStackOutput } from "../CloudFormation";

export abstract class Component<S extends JSONSchema> extends Construct {
    public readonly schema: S;
    protected readonly id: string;
    protected readonly serverless: Serverless;
    protected readonly configuration: FromSchema<S>;
    protected readonly stackName: string;
    protected readonly region: string;

    protected constructor(serverless: Serverless, id: string, schema: S, configuration: FromSchema<S>) {
        super(serverless.stack, id);

        this.id = id;
        this.serverless = serverless;
        this.schema = schema;
        this.configuration = configuration;
        this.stackName = serverless.getProvider("aws").naming.getStackName();
        this.region = serverless.getProvider("aws").getRegion();
    }

    public abstract exposedVariables(): Record<string, () => Record<string, unknown>>;

    commands(): Record<string, () => Promise<void>> {
        return {};
    }

    permissions(): PolicyStatement[] {
        return [];
    }

    async postDeploy(): Promise<void> {
        // Can be overridden in components
    }

    async preRemove(): Promise<void> {
        // Can be overridden in components
    }

    /**
     * Output for `serverless info`
     */
    abstract infoOutput(): Promise<string | undefined>;

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
