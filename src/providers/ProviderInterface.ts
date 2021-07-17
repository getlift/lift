import type { ConstructInterface } from "@lift/constructs";

export interface ProviderInterface {
    create(type: string, id: string): ConstructInterface;
}
