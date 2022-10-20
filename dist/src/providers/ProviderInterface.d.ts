import type { ConstructInterface } from "@lift/constructs";
export interface ProviderInterface {
    createConstruct(type: string, id: string): ConstructInterface;
}
