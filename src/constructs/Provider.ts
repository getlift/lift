import type { Serverless } from "../types/serverless";
import { Component } from "./Component";

export abstract class Provider<COMPONENT extends Component<any>> {
    protected readonly id: string;
    protected components: Record<string, COMPONENT> = {};

    constructor(serverless: Serverless, id: string) {
        this.id = id;
    }

    addComponent(id: string, component: COMPONENT): void {
        this.components[id] = component;
    }

    abstract package(): Promise<void>;

    abstract deploy(): Promise<void>;

    abstract remove(): Promise<void>;
}
