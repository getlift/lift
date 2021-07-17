import type { StaticConstructInterface } from "@lift/constructs";

export interface StaticProviderInterface {
    getConstructClass(type: string): StaticConstructInterface | undefined;
    getAllConstructClasses(): StaticConstructInterface[];
}
