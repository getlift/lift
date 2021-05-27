import type { Serverless } from "../types/serverless";
import { Construct } from "./Construct";

export abstract class Provider<C extends Construct> {
    protected readonly id: string;
    protected constructs: Record<string, C> = {};

    constructor(serverless: Serverless, id: string) {
        this.id = id;
    }

    addConstruct(id: string, construct: C): void {
        this.constructs[id] = construct;
    }

    abstract package(): Promise<void>;

    abstract deploy(): Promise<void>;

    abstract remove(): Promise<void>;
}
