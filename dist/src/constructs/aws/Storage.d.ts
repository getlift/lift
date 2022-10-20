import type { Construct as CdkConstruct } from "constructs";
import type { CfnResource } from "aws-cdk-lib";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import { PolicyStatement } from "../../CloudFormation";
declare const STORAGE_DEFINITION: {
    readonly type: "object";
    readonly properties: {
        readonly type: {
            readonly const: "storage";
        };
        readonly archive: {
            readonly type: "number";
            readonly minimum: 30;
        };
        readonly encryption: {
            readonly anyOf: readonly [{
                readonly const: "s3";
            }, {
                readonly const: "kms";
            }];
        };
    };
    readonly additionalProperties: false;
};
declare type Configuration = FromSchema<typeof STORAGE_DEFINITION>;
export declare class Storage extends AwsConstruct {
    private provider;
    static type: string;
    static schema: {
        readonly type: "object";
        readonly properties: {
            readonly type: {
                readonly const: "storage";
            };
            readonly archive: {
                readonly type: "number";
                readonly minimum: 30;
            };
            readonly encryption: {
                readonly anyOf: readonly [{
                    readonly const: "s3";
                }, {
                    readonly const: "kms";
                }];
            };
        };
        readonly additionalProperties: false;
    };
    private readonly bucket;
    private readonly bucketNameOutput;
    constructor(scope: CdkConstruct, id: string, configuration: Configuration, provider: AwsProvider);
    variables(): Record<string, unknown>;
    permissions(): PolicyStatement[];
    outputs(): Record<string, () => Promise<string | undefined>>;
    extend(): Record<string, CfnResource>;
    getBucketName(): Promise<string | undefined>;
}
export {};
