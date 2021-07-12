import { DescribeStacksInput, DescribeStacksOutput } from "aws-sdk/clients/cloudformation";
import { CfnOutput, Stack } from "@aws-cdk/core";
import { debug } from "./utils/logger";
import { AwsProvider } from "./providers";

export async function getStackOutput(aws: AwsProvider, output: CfnOutput): Promise<string | undefined> {
    const outputId = Stack.of(output.stack).resolve(output.logicalId) as string;
    const stackName = aws.stackName;

    debug(`Fetching output "${outputId}" in stack "${stackName}"`);

    let data: DescribeStacksOutput;
    try {
        data = await aws.request<DescribeStacksInput, DescribeStacksOutput>("CloudFormation", "describeStacks", {
            StackName: stackName,
        });
    } catch (e) {
        if (e instanceof Error && e.message === `Stack with id ${stackName} does not exist`) {
            debug(e.message);

            return undefined;
        }

        throw e;
    }
    if (!data.Stacks || !data.Stacks[0].Outputs) {
        return undefined;
    }
    for (const item of data.Stacks[0].Outputs) {
        if (item.OutputKey === outputId) {
            return item.OutputValue;
        }
    }

    return undefined;
}

export class PolicyStatement {
    Effect = "Allow";
    Action: string | string[];
    Resource: string | Array<unknown>;

    constructor(Action: string | string[], Resource: string | Array<unknown>) {
        this.Action = Action;
        this.Resource = Resource;
    }
}
