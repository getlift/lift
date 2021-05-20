import { CfnOutput, Duration, Stack } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { Queue as AwsQueue } from "@aws-cdk/aws-sqs";
import { PolicyStatement } from "../Stack";
import { AwsComponent } from "./AwsComponent";
import { Function, FUNCTION_DEFINITION } from "./Function";
import type { Serverless } from "../types/serverless";

export const QUEUE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "queue" },
        worker: FUNCTION_DEFINITION,
        maxRetries: { type: "number" },
        alarm: { type: "string" },
        batchSize: {
            type: "number",
            minimum: 1,
            maximum: 10,
        },
    },
    additionalProperties: false,
    required: ["worker"],
} as const;

export class Queue extends AwsComponent<typeof QUEUE_DEFINITION> {
    private readonly queue: AwsQueue;
    private readonly queueArnOutput: CfnOutput;
    private readonly queueUrlOutput: CfnOutput;
    private readonly function: Function;

    constructor(serverless: Serverless, id: string, configuration: FromSchema<typeof QUEUE_DEFINITION>, stack?: Stack) {
        super(serverless, id, QUEUE_DEFINITION, configuration, stack);

        // The default function timeout is 6 seconds in the Serverless Framework
        const functionTimeout = configuration.worker.timeout ?? 6;

        const maxRetries = configuration.maxRetries ?? 3;

        const dlq = new AwsQueue(this.stack, "Dlq", {
            queueName: this.stack.stackName + "-" + id + "-dlq",
            // 14 days is the maximum, we want to keep these messages for as long as possible
            retentionPeriod: Duration.days(14),
        });

        this.queue = new AwsQueue(this.stack, "Queue", {
            queueName: this.stack.stackName + "-" + id,
            // This should be 6 times the lambda function's timeout
            // See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
            visibilityTimeout: Duration.seconds(functionTimeout * 6),
            deadLetterQueue: {
                maxReceiveCount: maxRetries,
                queue: dlq,
            },
        });
        // ...

        this.function = new Function(serverless, `${id}Worker`, configuration.worker, this.stack);

        // CloudFormation outputs
        this.queueArnOutput = new CfnOutput(this.stack, "QueueName", {
            description: `Name of the "${id}" SQS queue.`,
            value: this.queue.queueName,
        });
        this.queueUrlOutput = new CfnOutput(this.stack, "QueueUrl", {
            description: `URL of the "${id}" SQS queue.`,
            value: this.queue.queueUrl,
        });

        // this.appendFunctions();
    }

    // TODO integrate in the stack
    // appendFunctions(): void {
    //     // The default batch size is 1
    //     const batchSize = this.configuration.batchSize ?? 1;
    //
    //     // Override events for the worker
    //     this.configuration.worker.events = [
    //         // Subscribe the worker to the SQS queue
    //         {
    //             sqs: {
    //                 arn: this.referenceQueueArn(),
    //                 batchSize: batchSize,
    //                 // TODO add setting
    //                 maximumBatchingWindow: 60,
    //             },
    //         },
    //     ];
    //     Object.assign(this.serverless.service.functions, {
    //         [`${this.id}Worker`]: this.configuration.worker,
    //     });
    // }

    permissions(): PolicyStatement[] {
        return [new PolicyStatement("sqs:SendMessage", [this.referenceQueueArn()])];
    }

    async infoOutput(): Promise<string | undefined> {
        return await this.getQueueUrl();
    }

    variables(): Record<string, () => Promise<string | undefined>> {
        return {
            queueArn: this.getQueueArn.bind(this),
            queueUrl: this.getQueueUrl.bind(this),
        };
    }

    referenceQueueArn(): Record<string, unknown> {
        return this.getCloudFormationReference(this.queue.queueArn);
    }

    async getQueueArn(): Promise<string | undefined> {
        return this.getOutputValue(this.queueArnOutput);
    }

    async getQueueUrl(): Promise<string | undefined> {
        return this.getOutputValue(this.queueUrlOutput);
    }
}
