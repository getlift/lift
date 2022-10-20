import { Stripe } from "stripe";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import type { ProviderInterface } from "@lift/providers";
import type { FromSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";
declare const STRIPE_DEFINITION: {
    readonly type: "object";
    readonly properties: {
        readonly profile: {
            readonly type: "string";
        };
    };
    readonly additionalProperties: false;
};
declare type Configuration = FromSchema<typeof STRIPE_DEFINITION>;
export declare class StripeProvider implements ProviderInterface {
    private readonly serverless;
    private readonly id;
    static type: string;
    static schema: {
        readonly type: "object";
        readonly properties: {
            readonly profile: {
                readonly type: "string";
            };
        };
        readonly additionalProperties: false;
    };
    private static readonly constructClasses;
    static registerConstructs(...constructClasses: StaticConstructInterface[]): void;
    static getConstructClass(type: string): StaticConstructInterface | undefined;
    static getAllConstructClasses(): StaticConstructInterface[];
    static create(serverless: Serverless, id: string, { profile }: Configuration): StripeProvider;
    private config;
    sdk: Stripe;
    constructor(serverless: Serverless, id: string, profile?: string);
    createConstruct(type: string, id: string): ConstructInterface;
    resolveConfiguration(profile?: string): {
        apiKey: string;
        accountId?: string;
    };
}
export {};
