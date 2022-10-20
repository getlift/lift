import type { FromSchema } from "json-schema-to-ts";
import type { Construct as CdkConstruct } from "constructs";
import type { CfnResource } from "aws-cdk-lib";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import type { ConstructCommands } from "@lift/constructs";
import { PolicyStatement } from "../../CloudFormation";
import type { CliOptions } from "../../types/serverless";
declare const QUEUE_DEFINITION: {
    readonly type: "object";
    readonly properties: {
        readonly type: {
            readonly const: "queue";
        };
        readonly worker: {
            readonly type: "object";
            readonly properties: {
                readonly timeout: {
                    readonly type: "number";
                };
            };
            readonly additionalProperties: true;
        };
        readonly maxRetries: {
            readonly type: "number";
        };
        readonly alarm: {
            readonly type: "string";
        };
        readonly batchSize: {
            readonly type: "number";
            readonly minimum: 1;
            readonly maximum: 10;
        };
        readonly maxBatchingWindow: {
            readonly type: "number";
            readonly minimum: 0;
            readonly maximum: 300;
        };
        readonly fifo: {
            readonly type: "boolean";
        };
        readonly delay: {
            readonly type: "number";
        };
        readonly encryption: {
            readonly type: "string";
        };
        readonly encryptionKey: {
            readonly type: "string";
        };
    };
    readonly additionalProperties: false;
    readonly required: readonly ["worker"];
};
declare type Configuration = FromSchema<typeof QUEUE_DEFINITION>;
export declare class Queue extends AwsConstruct {
    private readonly id;
    private readonly configuration;
    private readonly provider;
    static type: string;
    static schema: {
        readonly type: "object";
        readonly properties: {
            readonly type: {
                readonly const: "queue";
            };
            readonly worker: {
                readonly type: "object";
                readonly properties: {
                    readonly timeout: {
                        readonly type: "number";
                    };
                };
                readonly additionalProperties: true;
            };
            readonly maxRetries: {
                readonly type: "number";
            };
            readonly alarm: {
                readonly type: "string";
            };
            readonly batchSize: {
                readonly type: "number";
                readonly minimum: 1;
                readonly maximum: 10;
            };
            readonly maxBatchingWindow: {
                readonly type: "number";
                readonly minimum: 0;
                readonly maximum: 300;
            };
            readonly fifo: {
                readonly type: "boolean";
            };
            readonly delay: {
                readonly type: "number";
            };
            readonly encryption: {
                readonly type: "string";
            };
            readonly encryptionKey: {
                readonly type: "string";
            };
        };
        readonly additionalProperties: false;
        readonly required: readonly ["worker"];
    };
    static commands: ConstructCommands;
    private readonly queue;
    private readonly dlq;
    private readonly queueArnOutput;
    private readonly queueUrlOutput;
    private readonly dlqUrlOutput;
    constructor(scope: CdkConstruct, id: string, configuration: Configuration, provider: AwsProvider);
    outputs(): Record<string, () => Promise<string | undefined>>;
    variables(): Record<string, unknown>;
    permissions(): PolicyStatement[];
    extend(): Record<string, CfnResource>;
    private getMaximumBatchingWindow;
    private appendFunctions;
    private getQueueUrl;
    getDlqUrl(): Promise<string | undefined>;
    listDlq(): Promise<void>;
    purgeDlq(): Promise<void>;
    retryDlq(): Promise<void>;
    sendMessage(options: CliOptions): Promise<void>;
    displayLogs(options: CliOptions): void;
    private formatMessageBody;
    private askMessageBody;
}
export {};
