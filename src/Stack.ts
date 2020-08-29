import {Component} from "./components/Component";

export class Stack {
    name: string;
    region: string;
    private components: Array<Component> = [];

    constructor(name: string, region: string) {
        this.name = name;
        this.region = region;
    }

    compile(): Record<string, any> {
        let resources: Record<string, any>|null = {};
        let outputs: Record<string, any>|null = {};
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
}
