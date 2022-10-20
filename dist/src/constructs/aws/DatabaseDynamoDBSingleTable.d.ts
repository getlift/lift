import type { Construct as CdkConstruct } from "constructs";
import type { CfnResource } from "aws-cdk-lib";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import { PolicyStatement } from "../../CloudFormation";
declare const DATABASE_DEFINITION: {
    readonly type: "object";
    readonly properties: {
        readonly type: {
            readonly const: "database/dynamodb-single-table";
        };
        readonly localSecondaryIndexes: {
            readonly type: "boolean";
        };
        readonly gsiCount: {
            readonly type: "integer";
            readonly minimum: 1;
            readonly maximum: 20;
        };
    };
    readonly additionalProperties: false;
};
declare type Configuration = FromSchema<typeof DATABASE_DEFINITION>;
export declare class DatabaseDynamoDBSingleTable extends AwsConstruct {
    private provider;
    static type: string;
    static schema: {
        readonly type: "object";
        readonly properties: {
            readonly type: {
                readonly const: "database/dynamodb-single-table";
            };
            readonly localSecondaryIndexes: {
                readonly type: "boolean";
            };
            readonly gsiCount: {
                readonly type: "integer";
                readonly minimum: 1;
                readonly maximum: 20;
            };
        };
        readonly additionalProperties: false;
    };
    private readonly table;
    private readonly tableNameOutput;
    constructor(scope: CdkConstruct, id: string, configuration: Configuration, provider: AwsProvider);
    permissions(): PolicyStatement[];
    outputs(): Record<string, () => Promise<string | undefined>>;
    variables(): Record<string, unknown>;
    extend(): Record<string, CfnResource>;
    getTableName(): Promise<string | undefined>;
}
export {};
