import {pascalCase} from "pascal-case";
import {pascalCaseTransformMerge} from "pascal-case";
import {constantCase} from "constant-case";
import {Stack, PolicyStatement, CloudFormationOutputs} from '../Stack';

export abstract class Component {
    protected readonly stack: Stack;
    protected readonly stackName: string;

    abstract compile(): Record<string, any>;
    abstract outputs(): CloudFormationOutputs;
    abstract permissions(): Promise<PolicyStatement[]>;
    abstract envVariables(): Promise<Record<string, any>>;

    protected constructor(stack: Stack) {
        this.stack = stack;
        this.stackName = stack.name;
    }

    protected formatUniqueResourceName(name: string): string {
        return this.stackName + '-' + name;
    }

    protected formatCloudFormationId(name: string): string {
        return pascalCase(name, {
            transform: pascalCaseTransformMerge,
        });
    }

    protected formatEnvVariableName(name: string): string {
        return constantCase(name);
    }

    protected fnRef(resource: string): object {
        return { Ref: resource };
    }

    protected fnGetAtt(resource: string, attribute: string): object {
        return {
            'Fn::GetAtt': [resource, attribute]
        }
    }

    protected fnJoin(glue: string, strings: Array<any>): object {
        return {
            'Fn::Join': [
                glue,
                strings,
            ],
        }
    }

    protected tag(key: string, value: string|object): object {
        return {
            Key: key,
            Value: value,
        };
    }
}
