import { CfnOutput, Duration } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { Queue as AwsQueue } from "@aws-cdk/aws-sqs";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import { PolicyStatement } from "../Stack";
import { AwsComponent } from "./AwsComponent";
import { AwsProvider } from "./Provider";
import { Function, FUNCTION_DEFINITION } from "./Function";

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
    private readonly worker: Function;
    private readonly queueArnOutput: CfnOutput;
    private readonly queueUrlOutput: CfnOutput;

    constructor(provider: AwsProvider, id: string, configuration: FromSchema<typeof QUEUE_DEFINITION>) {
        super(provider, id, configuration);

        // The default function timeout is 6 seconds in the Serverless Framework
        const functionTimeout = configuration.worker.timeout ?? 6;

        const maxRetries = configuration.maxRetries ?? 3;

        const dlq = new AwsQueue(this.cdkNode, "Dlq", {
            queueName: this.provider.stack.stackName + "-" + id + "-dlq",
            // 14 days is the maximum, we want to keep these messages for as long as possible
            retentionPeriod: Duration.days(14),
        });

        this.queue = new AwsQueue(this.cdkNode, "Queue", {
            queueName: this.provider.stack.stackName + "-" + id,
            // This should be 6 times the lambda function's timeout
            // See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
            visibilityTimeout: Duration.seconds(functionTimeout * 6),
            deadLetterQueue: {
                maxReceiveCount: maxRetries,
                queue: dlq,
            },
        });
        // ...

        this.worker = new Function(this.provider, "Worker", configuration.worker);
        this.queue.grantConsumeMessages(this.worker.function);
        this.worker.function.addEventSource(
            new SqsEventSource(this.queue, {
                // The default batch size is 1
                batchSize: this.configuration.batchSize ?? 1,
                // TODO add setting
                maxBatchingWindow: Duration.seconds(1),
            })
        );

        // CloudFormation outputs
        this.queueArnOutput = new CfnOutput(this.cdkNode, "QueueArn", {
            description: `ARN of the "${id}" SQS queue.`,
            value: this.queue.queueArn,
        });
        this.queueUrlOutput = new CfnOutput(this.cdkNode, "QueueUrl", {
            description: `URL of the "${id}" SQS queue.`,
            value: this.queue.queueUrl,
        });
    }

    permissions(): PolicyStatement[] {
        return [new PolicyStatement("sqs:SendMessage", [this.referenceQueueArn()])];
    }

    async infoOutput(): Promise<string | undefined> {
        return await this.getQueueUrl();
    }

    public variables(): Record<string, () => Promise<string | undefined>> {
        return {
            queueArn: () => this.getQueueArn(),
            queueUrl: () => this.getQueueUrl(),
        };
    }

    references(): Record<string, () => Record<string, unknown>> {
        return {
            queueArn: () => this.referenceQueueArn(),
            queueUrl: () => this.referenceQueueUrl(),
        };
    }

    referenceQueueArn(): Record<string, unknown> {
        return this.getCloudFormationReference(this.queue.queueArn);
    }

    referenceQueueUrl(): Record<string, unknown> {
        return this.getCloudFormationReference(this.queue.queueUrl);
    }

    async getQueueArn(): Promise<string | undefined> {
        return this.getOutputValue(this.queueArnOutput);
    }

    async getQueueUrl(): Promise<string | undefined> {
        return this.getOutputValue(this.queueUrlOutput);
    }
}
