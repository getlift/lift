import type { ConstructInterface } from "@lift/constructs";
import type { ProviderInterface } from "@lift/providers";
import type { CliOptions } from "../types/serverless";
/**
 * Defines which static properties and methods a Lift construct must expose.
 */
export interface StaticConstructInterface {
    type: string;
    schema: {
        type: "object";
        [k: string]: unknown;
    };
    commands?: ConstructCommands;
    create(provider: ProviderInterface, id: string, configuration: {
        extensions?: Record<string, unknown>;
    } & Record<string, unknown>): ConstructInterface;
}
export declare type ConstructCommands = Record<string, ConstructCommandDefinition>;
declare type ConstructCommandDefinition = {
    usage: string;
    handler: (options: CliOptions) => void | Promise<void>;
    options?: {
        [name: string]: {
            usage: string;
            type: string;
            required?: boolean;
            shortcut?: string;
        };
    };
};
export {};
