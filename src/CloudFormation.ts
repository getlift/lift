import { DescribeStacksInput, DescribeStacksOutput } from 'aws-sdk/clients/cloudformation';
import AwsProvider from './constructs/aws/AwsProvider';

export async function getStackOutput(aws: AwsProvider, output: string): Promise<string | undefined> {
    const stackName = aws.stack.stackName;

    let data: DescribeStacksOutput;
    try {
        data = await aws.request<DescribeStacksInput, DescribeStacksOutput>('CloudFormation', 'describeStacks', {
            StackName: stackName,
        });
    } catch (e) {
        if (e instanceof Error && e.message === `Stack with id ${stackName} does not exist`) {
            return undefined;
        }

        throw e;
    }

    if (!data.Stacks || !data.Stacks[0].Outputs) {
        return undefined;
    }

    for (const item of data.Stacks[0].Outputs) {
        if (item.OutputKey === output) {
            return item.OutputValue;
        }
    }

    return undefined;
}
