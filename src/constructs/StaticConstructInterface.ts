import type { ConstructInterface } from "@lift/constructs";
import type { ProviderInterface } from "@lift/providers";
import type { CliOptions } from "../types/serverless";

export type ConstructSchema = {
    type: "object";
    [k: string]: unknown;
};

/**
 * Defines which static properties and methods a Lift construct must expose.
 */
export interface StaticConstructInterface {
    type: string;
    schema: ConstructSchema;
    commands?: ConstructCommands;
    create(provider: ProviderInterface, id: string, configuration: Record<string, unknown>): ConstructInterface;
}

export type ConstructCommands = Record<string, ConstructCommandDefinition>;
type ConstructCommandDefinition = {
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
