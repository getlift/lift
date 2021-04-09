import { pascalCase } from "pascal-case";
import { pascalCaseTransformMerge } from "pascal-case";
import {
    CloudFormationOutputs,
    CloudFormationResources,
    PolicyStatement,
    Stack,
} from "../Stack";

export abstract class Component {
    protected readonly stack: Stack;
    protected readonly stackName: string;

    abstract compile(): CloudFormationResources;
    abstract outputs(): CloudFormationOutputs;
    abstract permissionsReferences(): Promise<PolicyStatement[]>;

    protected constructor(stack: Stack) {
        this.stack = stack;
        this.stackName = stack.name;
    }

    protected formatUniqueResourceName(name: string): string {
        return this.stackName + "-" + name;
    }

    protected formatCloudFormationId(name: string): string {
        return pascalCase(name, {
            transform: pascalCaseTransformMerge,
        });
    }

    protected fnRef(resource: string): Record<string, unknown> {
        return { Ref: resource };
    }

    protected fnGetAtt(
        resource: string,
        attribute: string
    ): Record<string, unknown> {
        return {
            "Fn::GetAtt": [resource, attribute],
        };
    }

    protected fnJoin(
        glue: string,
        strings: Array<unknown>
    ): Record<string, unknown> {
        return {
            "Fn::Join": [glue, strings],
        };
    }

    protected fnSub(string: string): Record<string, unknown> {
        return {
            "Fn::Sub": string,
        };
    }

    protected tag(
        key: string,
        value: string | Record<string, unknown>
    ): Record<string, unknown> {
        return {
            Key: key,
            Value: value,
        };
    }
}
