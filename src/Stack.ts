import {Component} from "./components/Component";
import {Vpc, VpcDetails} from './components/Vpc';
import CloudFormation from 'aws-sdk/clients/cloudformation';
import {availabilityZones} from './Zones';
import { getOutputs } from './aws/CloudFormation';
import {S3} from './components/S3';
import {Queue} from './components/Queue';
import {Database} from './components/Database';
import {StaticWebsite} from './components/StaticWebsite';

export type CloudFormationTemplate = {
    AWSTemplateFormatVersion: '2010-09-09',
    Metadata: Record<string, any>|null,
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
    readonly config: Record<string, any>;
    private components: Array<Component> = [];
    private vpc?: Vpc;
    private readonly cloudFormation: CloudFormation;

    // Local cache
    private deployedOutputs: Record<string, string>|null = null;

    static async create(name: string, region: string, config: Record<string, any>): Promise<Stack> {
        const stack = new Stack(name, region, config);
        if (config.hasOwnProperty('s3') && config.s3) {
            for (const [key, value] of Object.entries(config.s3)) {
                stack.add(new S3(stack, key, value as Record<string, any>));
            }
        }
        if (config.hasOwnProperty('queues') && config.queues) {
            for (const [key, value] of Object.entries(config.queues)) {
                stack.add(new Queue(stack, key, value as Record<string, any>));
            }
        }
        // Enabling the VPC must come before other components that can enable the VPC (e.g. `db`)
        if (config.hasOwnProperty('vpc')) {
            stack.enableVpc(config['vpc']);
        }
        if (config.hasOwnProperty('db')) {
            stack.add(new Database(stack, config.db as Record<string, any>));
        }
        if (config.hasOwnProperty('static-website')) {
            stack.add(new StaticWebsite(stack, config['static-website']));
        }
        return stack;
    }

    private constructor(name: string, region: string, config: Record<string, any>) {
        this.name = name;
        this.region = region;
        this.config = config;
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
            Metadata: {
                // Encoded as JSON because CloudFormation templates have strict rules,
                // like no `null` values.
                'Lift::Template': JSON.stringify(this.config),
                'Lift::Version': '1',
            },
            Resources: resources,
            Outputs: outputs,
        };
    }

    add(component: Component) {
        this.components.push(component);
    }

    async permissionsInStack(): Promise<PolicyStatement[]> {
        const permissions: PolicyStatement[] = [];
        for (const component of this.components) {
            permissions.push(...(await component.permissionsReferences()));
        }
        return permissions;
    }

    async variables(): Promise<Record<string, any>> {
        const variables: Record<string, any> = {};
        for (const component of this.components) {
            Object.assign(variables, await component.envVariables());
        }
        return variables;
    }

    async variablesInStack(): Promise<Record<string, any>> {
        const variables: Record<string, any> = {};
        for (const component of this.components) {
            Object.assign(variables, await component.envVariablesReferences());
        }
        return variables;
    }

    enableVpc(props?: Record<string, any>) {
        if (this.vpc) return;
        this.vpc = new Vpc(this, props ? props : {});
        this.components.push(this.vpc);
    }

    async vpcDetailsReference(): Promise<VpcDetails | undefined> {
        return this.vpc?.detailsReferences();
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
            throw new Error(`lift.yml contains changes that differ from the deployed stack (the '${key}' CloudFormation output is missing). Deploy via 'lift up' first.`);
        }
        return outputs[key];
    }

    private async getOutputs(): Promise<Record<string, string>> {
        // Refresh the cache
        if (! this.deployedOutputs) {
            this.deployedOutputs = await getOutputs(this.region, this.name);
        }

        return this.deployedOutputs;
    }
}
