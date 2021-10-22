import type { ConstructInterface } from "@lift/constructs";

export interface ProviderInterface {
    createConstruct(type: string, id: string, configuration: Record<string, unknown>): ConstructInterface;

    deploy(): Promise<void>;
}
