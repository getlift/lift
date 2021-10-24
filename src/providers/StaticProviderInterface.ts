import type { StaticConstructInterface } from "@lift/constructs";
import type { ProviderInterface } from "@lift/providers";
import type { ServerlessConfig } from "../Config";

export interface StaticProviderInterface {
    type: string;
    schema: {
        type: "object";
        [k: string]: unknown;
    };
    getConstructClass(type: string): StaticConstructInterface | undefined;
    getAllConstructClasses(): StaticConstructInterface[];
    create(id: string, configuration: Record<string, unknown>, globalConfig: ServerlessConfig): ProviderInterface;
}
