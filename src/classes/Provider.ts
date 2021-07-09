import { ConstructInterface, StaticConstructInterface } from "./Construct";

export interface ProviderInterface {
    create(type: string, id: string): ConstructInterface;
}

export interface StaticProviderInterface {
    getConstructClass(type: string): StaticConstructInterface | undefined;
    getAllConstructClasses(): StaticConstructInterface[];
}
