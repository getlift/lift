import { App, CfnOutput, Stack } from "@aws-cdk/core";
import { FromSchema, JSONSchema } from "json-schema-to-ts";
import { PolicyStatement } from "../Stack";
import { getStackOutput } from "../CloudFormation";
import { Component } from "./Component";
import { deployCdk, removeCdk } from "../aws/CloudFormation";
import type { Serverless } from "../types/serverless";

export abstract class AwsComponent<S extends JSONSchema> extends Component<S> {
    protected readonly app: App | undefined;
    protected readonly stack: Stack;
    protected readonly region: string;

    protected constructor(
        serverless: Serverless,
        id: string,
        schema: S,
        configuration: FromSchema<S>,
        stack: Stack | undefined
    ) {
        super(serverless, id, schema, configuration);

        const aws = serverless.getProvider("aws");
        this.region = aws.getRegion();
        const baseStackName = aws.naming.getStackName();

        // Integrates in an existing stack
        if (stack) {
            this.stack = stack;
        } else {
            this.app = new App({
                context: {
                    "@aws-cdk/core:newStyleStackSynthesis": true,
                },
            });
            this.stack = new Stack(this.app, `${baseStackName}-${id}`, {
                env: {
                    region: this.region,
                },
            });
        }
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
        if (this.app) {
            await deployCdk(this.serverless, this.app, this.stack);
        }
    }

    protected async removeCDK(): Promise<void> {
        if (this.app) {
            await removeCdk(this.serverless, this.stack);
        }
    }
}
