import { pascalCase, pascalCaseTransformMerge } from "pascal-case";
import {
    DescribeStacksInput,
    DescribeStacksOutput,
} from "aws-sdk/clients/cloudformation";
import { availabilityZones } from "./Zones";
import { Serverless } from "./types/serverless";

export function formatCloudFormationId(name: string): string {
    return pascalCase(name, {
        transform: pascalCaseTransformMerge,
    });
}

export async function getStackOutput(
    serverless: Serverless,
    output: string
): Promise<string | undefined> {
    const stackName = serverless.getProvider("aws").naming.getStackName();

    let data: DescribeStacksOutput;
    try {
        data = await serverless
            .getProvider("aws")
            .request<DescribeStacksInput, DescribeStacksOutput>(
                "CloudFormation",
                "describeStacks",
                {
                    StackName: stackName,
                }
            );
    } catch (e) {
        if (
            e instanceof Error &&
            e.message === `Stack with id ${stackName} does not exist`
        ) {
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
