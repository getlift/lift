import { pascalCase, pascalCaseTransformMerge } from "pascal-case";

export function formatCloudFormationId(name: string): string {
    return pascalCase(name, {
        transform: pascalCaseTransformMerge,
    });
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
