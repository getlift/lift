import { Vpc as CdkVpc } from "aws-cdk-lib/aws-ec2";
import type { Construct as CdkConstruct } from "constructs";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import type { ConstructInterface } from "@lift/constructs";
declare const VPC_DEFINITION: {
    readonly type: "object";
    readonly properties: {
        readonly type: {
            readonly const: "vpc";
        };
    };
    readonly additionalProperties: false;
    readonly required: readonly [];
};
declare type Configuration = FromSchema<typeof VPC_DEFINITION>;
export declare class Vpc extends CdkVpc implements ConstructInterface {
    private provider;
    static type: string;
    static schema: {
        readonly type: "object";
        readonly properties: {
            readonly type: {
                readonly const: "vpc";
            };
        };
        readonly additionalProperties: false;
        readonly required: readonly [];
    };
    static create(provider: AwsProvider, id: string, configuration: Configuration): Vpc;
    private readonly appSecurityGroup;
    constructor(scope: CdkConstruct, id: string, configuration: Configuration, provider: AwsProvider);
    outputs(): Record<string, () => Promise<string | undefined>>;
}
export {};
