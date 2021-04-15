import { Component } from "./components/Component";
import { availabilityZones } from "./Zones";
import { S3 } from "./components/S3";

export type CloudFormationTemplate = {
    AWSTemplateFormatVersion: string;
    Metadata: Record<string, unknown> | null;
    Resources?: Record<string, unknown>;
    Outputs?: CloudFormationOutputs;
};

export type CloudFormationResources = Record<string, CloudFormationResource>;
export type CloudFormationResource = {
    Type: string;
    Properties: Record<string, unknown>;
};

export type CloudFormationOutputs = Record<string, CloudFormationOutput>;
export type CloudFormationOutput = {
    Description: string;
    Value: string | Record<string, unknown>;
    Export?: {
        Name: string;
    };
};

export class PolicyStatement {
    Effect = "Allow";
    Action: string | string[];
    Resource: string | Array<unknown>;
    constructor(Action: string | string[], Resource: string | Array<unknown>) {
        this.Action = Action;
        this.Resource = Resource;
    }
}

const isConfig = <T extends string>(
    config: unknown,
    key: T
): config is Record<T, Record<string, unknown>> => {
    return (
        Object.prototype.hasOwnProperty.call(
            config as Record<string, unknown>,
            key
        ) && (config as Record<string, unknown>)[key] !== undefined
    );
};

export class Stack {
    readonly name: string;
    readonly region: string;
    readonly config: Record<string, unknown>;
    private components: Array<Component> = [];

    static create(
        name: string,
        region: string,
        config: Record<string, unknown>
    ): Stack {
        const stack = new Stack(name, region, config);
        if (isConfig(config, "s3")) {
            for (const [key, value] of Object.entries(config.s3)) {
                stack.add(new S3(stack, key, value as Record<string, unknown>));
            }
        }

        return stack;
    }

    private constructor(
        name: string,
        region: string,
        config: Record<string, unknown>
    ) {
        this.name = name;
        this.region = region;
        this.config = config;
    }

    compile(): CloudFormationTemplate {
        const cloudFormationTemplate: CloudFormationTemplate = {
            AWSTemplateFormatVersion: "2010-09-09",
            Metadata: {
                // Encoded as JSON because CloudFormation templates have strict rules,
                // like no `null` values.
                "Lift::Template": JSON.stringify(this.config),
                "Lift::Version": "1",
            },
        };
        const resources: CloudFormationResources = {};
        const outputs: CloudFormationOutputs = {};
        this.components.map((component) => {
            const newResources = component.compile();
            Object.keys(newResources).map((name) => {
                resources[name] = newResources[name];
            });
            const newOutputs = component.outputs();
            Object.keys(newOutputs).map((name) => {
                outputs[name] = newOutputs[name];
            });
        });
        if (Object.keys(resources).length !== 0) {
            cloudFormationTemplate.Resources = resources;
        }
        if (Object.keys(outputs).length !== 0) {
            cloudFormationTemplate.Outputs = outputs;
        }

        return cloudFormationTemplate;
    }

    add(component: Component): void {
        this.components.push(component);
    }

    async permissionsInStack(): Promise<PolicyStatement[]> {
        const permissions: PolicyStatement[] = [];
        for (const component of this.components) {
            permissions.push(...(await component.permissionsReferences()));
        }

        return permissions;
    }

    availabilityZones(): string[] {
        const allZones = availabilityZones as Record<string, string[]>;

        return (
            allZones[this.region]
                // Keep maximum 3 zones
                .slice(0, 3)
        );
    }
}
