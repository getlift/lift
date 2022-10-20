import type { Construct as CdkConstruct } from "constructs";
import type { CfnResource } from "aws-cdk-lib";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
declare const WEBHOOK_DEFINITION: {
    readonly type: "object";
    readonly properties: {
        readonly type: {
            readonly const: "webhook";
        };
        readonly authorizer: {
            readonly type: "object";
            readonly properties: {
                readonly handler: {
                    readonly type: "string";
                };
            };
            readonly required: readonly ["handler"];
            readonly additionalProperties: true;
        };
        readonly insecure: {
            readonly type: "boolean";
        };
        readonly path: {
            readonly type: "string";
        };
        readonly eventType: {
            readonly type: "string";
        };
    };
    readonly required: readonly ["path"];
    readonly additionalProperties: false;
};
declare type Configuration = FromSchema<typeof WEBHOOK_DEFINITION>;
export declare class Webhook extends AwsConstruct {
    private readonly id;
    private readonly configuration;
    private readonly provider;
    static type: string;
    static schema: {
        readonly type: "object";
        readonly properties: {
            readonly type: {
                readonly const: "webhook";
            };
            readonly authorizer: {
                readonly type: "object";
                readonly properties: {
                    readonly handler: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["handler"];
                readonly additionalProperties: true;
            };
            readonly insecure: {
                readonly type: "boolean";
            };
            readonly path: {
                readonly type: "string";
            };
            readonly eventType: {
                readonly type: "string";
            };
        };
        readonly required: readonly ["path"];
        readonly additionalProperties: false;
    };
    private readonly api;
    private readonly bus;
    private readonly apiEndpointOutput;
    private readonly endpointPathOutput;
    constructor(scope: CdkConstruct, id: string, configuration: Configuration, provider: AwsProvider);
    outputs(): Record<string, () => Promise<string | undefined>>;
    variables(): Record<string, unknown>;
    extend(): Record<string, CfnResource>;
    private appendFunctions;
    private getEndpointPath;
    private getHttpMethod;
    private getUrl;
}
export {};
