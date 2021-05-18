import { App, CfnOutput, Stack } from "@aws-cdk/core";
import { FromSchema, JSONSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";
import { PolicyStatement } from "../Stack";
import { getStackOutput } from "../CloudFormation";
import { CloudformationTemplate } from "../types/serverless";
import { Component } from "./Component";

export abstract class AwsComponent<S extends JSONSchema> extends Component<S> {
    protected readonly app: App;
    protected readonly stack: Stack;
    protected readonly region: string;

    protected constructor(serverless: Serverless, id: string, schema: S, configuration: FromSchema<S>) {
        super(serverless, id, schema, configuration);

        this.app = new App();
        this.stack = new Stack(this.app, id);

        this.region = serverless.getProvider("aws").getRegion();
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
        return Stack.of(this).resolve(value) as Record<string, unknown>;
    }

    protected async getOutputValue(output: CfnOutput): Promise<string | undefined> {
        return await getStackOutput(this.serverless, Stack.of(this).resolve(output.logicalId));
    }

    protected async deployCDK() {
        const template = this.app.synth().getStackByName(this.stack.stackName).template as CloudformationTemplate;
        // TODO deploy via CDK or CloudFormation
    }

    protected async removeCDK() {
        throw new Error("Method not implemented.");
    }
}
