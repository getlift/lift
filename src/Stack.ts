import {Component} from "./components/Component";
import {Vpc} from './components/Vpc';
import CloudFormation from 'aws-sdk/clients/cloudformation';
import {availabilityZones} from './Zones';

export type CloudFormationTemplate = {
    AWSTemplateFormatVersion: '2010-09-09',
    Resources: Record<string, any>|null,
    Outputs: CloudFormationOutputs|null,
};

export type CloudFormationResources = Record<string, CloudFormationResource>;
export type CloudFormationResource = {
    Type: string;
    Properties: Record<string, any>;
};

export type CloudFormationOutputs = Record<string, CloudFormationOutput>;
export type CloudFormationOutput = {
    Description: string;
    Value: string|object;
    Export?: {
        Name: string;
    };
};

export class PolicyStatement {
    Effect = 'Allow';
    Action: string|string[];
    Resource: string|Array<any>;
    constructor(Action: string|string[], Resource: string|Array<any>) {
        this.Action = Action;
        this.Resource = Resource;
    }
}

export class Stack {
    readonly name: string;
    readonly region: string;
    private components: Array<Component> = [];
    private _vpc?: Vpc;
    private readonly cloudFormation: CloudFormation;

    // Local cache
    private deployedOutputs: Record<string, string>|null = null;

    constructor(name: string, region: string) {
        this.name = name;
        this.region = region;
        this.cloudFormation = new CloudFormation({
            region: region,
        });
    }

    compile(): CloudFormationTemplate {
        let resources: CloudFormationResources|null = {};
        let outputs: CloudFormationOutputs|null = {};
        this.components.map(component => {
            const newResources = component.compile();
            Object.keys(newResources).map(name => {
                resources![name] = newResources[name];
            });
            const newOutputs = component.outputs();
            Object.keys(newOutputs).map(name => {
                outputs![name] = newOutputs[name];
            });
        });
        if (Object.keys(resources).length === 0) {
            resources = null;
        }
        if (Object.keys(outputs).length === 0) {
            outputs = null;
        }
        return {
            AWSTemplateFormatVersion: '2010-09-09',
            Resources: resources,
            Outputs: outputs,
        };
    }

    add(component: Component) {
        this.components.push(component);
    }

    async permissions(): Promise<any[]> {
        const permissions: any[] = [];
        for (const component of this.components) {
            permissions.push(...(await component.permissions()));
        }
        return permissions;
    }

    async permissionsInStack(): Promise<any[]> {
        const permissions: any[] = [];
        for (const component of this.components) {
            permissions.push(...(await component.permissionsReferences()));
        }
        return permissions;
    }

    async variables() {
        const variables: Record<string, any> = {};
        for (const component of this.components) {
            Object.assign(variables, await component.envVariables());
        }
        return variables;
    }

    async variablesInStack() {
        const variables: Record<string, any> = {};
        for (const component of this.components) {
            Object.assign(variables, await component.envVariablesReferences());
        }
        return variables;
    }

    enableVpc(props?: Record<string, any>) {
        if (this._vpc) return;
        this._vpc = new Vpc(this, props ? props : {});
        this.components.push(this._vpc);
    }

    get vpc(): Vpc|undefined {
        return this._vpc;
    }

    availabilityZones(): string[] {
        const allZones = availabilityZones as Record<string, string[]>;
        return allZones[this.region]
            // Keep maximum 3 zones
            .slice(0, 3);
    }

    async getOutput(key: string): Promise<string> {
        const outputs = await this.getOutputs();
        if (! outputs[key]) {
            throw new Error('lift.yml contains changes that differ from the deployed stack. Deploy via `lift up` first.')
        }
        return outputs[key];
    }

    private async getOutputs(): Promise<Record<string, string>> {
        // Refresh the cache
        if (! this.deployedOutputs) {
            const stack = await this.cloudFormation.describeStacks({
                StackName: this.name,
            }).promise();

            if (! stack.Stacks || ! stack.Stacks[0].Outputs) {
                throw new Error(`Stack ${this.name} is not deployed yet.`);
            }

            const out: Record<string, string> = {};
            for (const output of stack.Stacks[0].Outputs) {
                if (output.OutputKey && output.OutputValue) {
                    out[output.OutputKey] = output.OutputValue;
                }
            }
            this.deployedOutputs = out;
        }

        return this.deployedOutputs;
    }
}
