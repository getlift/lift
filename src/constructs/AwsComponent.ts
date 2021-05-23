import { CfnOutput, Construct, Stack } from "@aws-cdk/core";
import { FromSchema, JSONSchema } from "json-schema-to-ts";
import { PolicyStatement } from "../Stack";
import { getStackOutput } from "../CloudFormation";
import { Component } from "./Component";
import { AwsProvider } from "./Provider";

export abstract class AwsComponent<S extends JSONSchema> extends Component<S> {
    protected readonly provider: AwsProvider;
    protected readonly cdkNode: Construct;

    protected constructor(provider: AwsProvider, id: string, configuration: FromSchema<S>) {
        super(provider, id, configuration);

        this.provider = provider;
        this.cdkNode = new Construct(provider.stack, id);
    }

    async postDeploy(): Promise<void> {
        // Can be overridden by constructs
    }

    async preRemove(): Promise<void> {
        // Can be overridden by constructs
    }

    permissions(): PolicyStatement[] {
        return [];
    }

    /**
     * Returns a CloudFormation intrinsic function, like Fn::Ref, GetAtt, etc.
     */
    protected getCloudFormationReference(value: string): Record<string, unknown> {
        return Stack.of(this.cdkNode).resolve(value) as Record<string, unknown>;
    }

    protected async getOutputValue(output: CfnOutput): Promise<string | undefined> {
        return await getStackOutput(this.provider, Stack.of(this.cdkNode).resolve(output.logicalId));
    }
}
