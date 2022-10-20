import type { StaticConstructInterface } from "@lift/constructs";
import type { ProviderInterface } from "@lift/providers";
import type { Serverless } from "src/types/serverless";
export interface StaticProviderInterface {
    type: string;
    schema: {
        type: "object";
        [k: string]: unknown;
    };
    getConstructClass(type: string): StaticConstructInterface | undefined;
    getAllConstructClasses(): StaticConstructInterface[];
    create(serverless: Serverless, id: string, configuration: Record<string, unknown>): ProviderInterface;
}
