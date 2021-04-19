import { pascalCase, pascalCaseTransformMerge } from "pascal-case";
import {
    CloudFormationClient,
    DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { DescribeStacksCommandOutput } from "@aws-sdk/client-cloudformation/commands/DescribeStacksCommand";
import { availabilityZones } from "./Zones";

export function formatCloudFormationId(name: string): string {
    return pascalCase(name, {
        transform: pascalCaseTransformMerge,
    });
}

export async function getStackOutput(
    region: string,
    stackName: string,
    output: string
): Promise<string | undefined> {
    /**
     * TODO use awsRequest
     * https://github.com/serverless/serverless/blob/master/lib/aws/request.js
     */
    const client = new CloudFormationClient({ region: region });

    let data: DescribeStacksCommandOutput;
    try {
        data = await client.send(
            new DescribeStacksCommand({
                StackName: stackName,
            })
        );
    } catch (e) {
        if ((e as Error).message === "Stack with id Default does not exist") {
            throw new Error(
                `The stack ${stackName} in region ${region} does not exist, did you forget to deploy with 'serverless deploy' first?`
            );
        }

        throw e;
    }

    if (!data.Stacks || !data.Stacks[0].Outputs) {
        throw new Error(`Stack ${stackName} is not deployed yet.`);
    }

    for (const item of data.Stacks[0].Outputs) {
        if (item.OutputKey === output) {
            return item.OutputValue;
        }
    }

    return undefined;
}

export function cfRef(resource: string): { Ref: string } {
    return { Ref: resource };
}

export function cfGetAtt(
    resource: string,
    attribute: string
): Record<string, [string, string]> {
    return {
        "Fn::GetAtt": [resource, attribute],
    };
}

export function cfJoin(
    glue: string,
    strings: Array<unknown>
): Record<string, [string, Array<unknown>]> {
    return {
        "Fn::Join": [glue, strings],
    };
}

export function cfSub(string: string): Record<string, string> {
    return {
        "Fn::Sub": string,
    };
}

type CloudFormationTag = {
    Key: string;
    Value: string | Record<string, unknown>;
};

export function cfTag(
    key: string,
    value: string | Record<string, unknown>
): CloudFormationTag {
    return {
        Key: key,
        Value: value,
    };
}

export function getAvailabilityZones(region: string): string[] {
    const allZones = availabilityZones as Record<string, string[]>;

    return (
        allZones[region]
            // Keep maximum 3 zones
            .slice(0, 3)
    );
}
