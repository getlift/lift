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
        const resources: Record<string, any> = {};
        const outputs: Record<string, any> = {};
        this.components.map(component => {
            const newResources = component.compile();
            Object.keys(newResources).map(name => {
                resources[name] = newResources[name];
            });
            const newOutputs = component.outputs();
            Object.keys(newOutputs).map(name => {
                outputs[name] = newOutputs[name];
            });
        });
        return {
            AWSTemplateFormatVersion: '2010-09-09',
            Resources: resources,
            Outputs: outputs,
        };
    }

    add(component: Component) {
        this.components.push(component);
    }
}
