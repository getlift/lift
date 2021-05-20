import { App, CfnOutput, Stack } from "@aws-cdk/core";
import { FromSchema, JSONSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";
import { PolicyStatement } from "../Stack";
import { getStackOutput } from "../CloudFormation";
import { Component } from "./Component";
import { deployCdk, removeCdk } from "../aws/CloudFormation";

export abstract class AwsComponent<S extends JSONSchema> extends Component<S> {
    protected readonly app: App;
    protected readonly stack: Stack;
    protected readonly region: string;

    protected constructor(serverless: Serverless, id: string, schema: S, configuration: FromSchema<S>) {
        super(serverless, id, schema, configuration);

        this.region = serverless.getProvider("aws").getRegion();
        const baseStackName = serverless.getProvider("aws").naming.getStackName();

        this.app = new App();
        this.stack = new Stack(this.app, `${baseStackName}-${id}`, {
            env: {
                region: this.region,
            },
        });
    }

    async deploy(): Promise<void> {
        await this.deployCDK();
    }

    async remove(): Promise<void> {
        await this.removeCDK();
    }

    permissions(): PolicyStatement[] {
        return [];
    }

    /**
     * Returns a CloudFormation intrinsic function, like Fn::Ref, GetAtt, etc.
     */
    protected getCloudFormationReference(value: string): Record<string, unknown> {
        return this.stack.resolve(value) as Record<string, unknown>;
    }

    protected async getOutputValue(output: CfnOutput): Promise<string | undefined> {
        return await getStackOutput(this.serverless, this.stack, this.stack.resolve(output.logicalId));
    }

    protected async deployCDK(): Promise<void> {
        await deployCdk(this.serverless, this.app, this.stack);
    }

    protected async removeCDK(): Promise<void> {
        await removeCdk(this.serverless, this.stack);
    }
}
