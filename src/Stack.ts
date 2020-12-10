import {Component} from "./components/Component";
import {Vpc} from './components/Vpc';
import fs from 'fs';

export type CloudFormationTemplate = {
    AWSTemplateFormatVersion: '2010-09-09',
    Resources: Record<string, any>|null,
    Outputs: Record<string, CloudFormationOutput>|null,
};

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

    constructor(name: string, region: string) {
        this.name = name;
        this.region = region;
    }

    compile(): CloudFormationTemplate {
        let resources: Record<string, any>|null = {};
        let outputs: Record<string, CloudFormationOutput>|null = {};
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

    permissions(): any[] {
        const permissions: any[] = [];
        this.components.map(component => {
            permissions.push(...component.permissions());
        });
        return permissions;
    }

    variables() {
        const variables: Record<string, any> = {};
        this.components.map(component => {
            const newVariables = component.envVariables();
            Object.keys(newVariables).map(name => {
                variables[name] = newVariables[name];
            });
        });
        return variables;
    }

    enableVpc(props?: Record<string, any>) {
        this._vpc = new Vpc(this, props ? props : {});
        this.components.push(this._vpc);
    }

    get vpc(): Vpc|undefined {
        return this._vpc;
    }

    availabilityZones(): string[] {
        const json = fs.readFileSync(__dirname + '/../zones.json').toString();
        const allZones = JSON.parse(json) as Record<string, string[]>;
        return allZones[this.region]
            // Keep maximum 3 zones
            .slice(0, 3);
    }
}
