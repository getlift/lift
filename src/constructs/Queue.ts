import { Queue as CdkQueue } from "@aws-cdk/aws-sqs";
import { FromSchema } from "json-schema-to-ts";
import { Alarm, ComparisonOperator, Metric } from "@aws-cdk/aws-cloudwatch";
import { Subscription, SubscriptionProtocol, Topic } from "@aws-cdk/aws-sns";
import { AlarmActionConfig } from "@aws-cdk/aws-cloudwatch/lib/alarm-action";
import { Construct as CdkConstruct, CfnOutput, Duration } from "@aws-cdk/core";
import { PolicyStatement } from "../Stack";
import Construct from "../classes/Construct";
import AwsProvider from "../classes/AwsProvider";

export const QUEUE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "queue" },
        worker: {
            type: "object",
            properties: {
                handler: { type: "string" },
                timeout: { type: "number" },
            },
            required: ["handler"],
            additionalProperties: true,
        },
        maxRetries: { type: "number" },
        alarm: { type: "string" },
        batchSize: {
            type: "number",
            minimum: 1,
            maximum: 10,
        },
    },
    additionalProperties: false,
    required: ["type", "worker"],
} as const;
type Configuration = FromSchema<typeof QUEUE_DEFINITION>;

export class Queue extends CdkConstruct implements Construct {
    private readonly queue: CdkQueue;
    private readonly queueArnOutput: CfnOutput;
    private readonly queueUrlOutput: CfnOutput;
    private readonly dlqUrlOutput: CfnOutput;

    constructor(
        scope: CdkConstruct,
        private readonly id: string,
        private readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);

        // The default function timeout is 6 seconds in the Serverless Framework
        const functionTimeout = configuration.worker.timeout ?? 6;

        const maxRetries = configuration.maxRetries ?? 3;

        const dlq = new CdkQueue(this, "Dlq", {
            queueName: `${this.provider.stackName}-${id}-dlq`,
            // 14 days is the maximum, we want to keep these messages for as long as possible
            retentionPeriod: Duration.days(14),
        });

        this.queue = new CdkQueue(this, "Queue", {
            queueName: `${this.provider.stackName}-${id}`,
            // This should be 6 times the lambda function's timeout
            // See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
            visibilityTimeout: Duration.seconds(functionTimeout * 6),
            deadLetterQueue: {
                maxReceiveCount: maxRetries,
                queue: dlq,
            },
        });

        const alarmEmail = configuration.alarm;
        if (alarmEmail !== undefined) {
            const alarmTopic = new Topic(this, "AlarmTopic", {
                topicName: `${this.provider.stackName}-${id}-dlq-alarm-topic`,
                displayName: `[Alert][${id}] There are failed jobs in the dead letter queue.`,
            });
            new Subscription(this, "AlarmTopicSubscription", {
                topic: alarmTopic,
                protocol: SubscriptionProtocol.EMAIL,
                endpoint: alarmEmail,
            });

            const alarm = new Alarm(this, "Alarm", {
                alarmName: `${this.provider.stackName}-${id}-dlq-alarm`,
                alarmDescription: "Alert triggered when there are failed jobs in the dead letter queue.",
                metric: new Metric({
                    namespace: "AWS/SQS",
                    metricName: "ApproximateNumberOfMessagesVisible",
                    dimensions: {
                        QueueName: dlq.queueName,
                    },
                    statistic: "Sum",
                    period: Duration.minutes(1),
                }),
                evaluationPeriods: 1,
                // Alert as soon as we have 1 message in the DLQ
                threshold: 0,
                comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
            });
            alarm.addAlarmAction({
                bind(): AlarmActionConfig {
                    return { alarmActionArn: alarmTopic.topicArn };
                },
            });
        }

        // CloudFormation outputs
        this.queueArnOutput = new CfnOutput(this, "QueueArn", {
            description: `ARN of the "${id}" SQS queue.`,
            value: this.queue.queueArn,
        });
        this.queueUrlOutput = new CfnOutput(this, "QueueUrl", {
            description: `URL of the "${id}" SQS queue.`,
            value: this.queue.queueUrl,
        });
        this.dlqUrlOutput = new CfnOutput(this, "DlqUrl", {
            description: `URL of the "${id}" SQS Dead Letter Queue.`,
            value: dlq.queueUrl,
        });

        this.appendFunctions();
    }

    commands(): Record<string, () => void | Promise<void>> {
        return {};
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            queueUrl: () => this.getQueueUrl(),
        };
    }

    references(): Record<string, Record<string, unknown>> {
        return {
            queueUrl: this.referenceQueueUrl(),
            queueArn: this.referenceQueueArn(),
        };
    }

    permissions(): PolicyStatement[] {
        return [new PolicyStatement("sqs:SendMessage", [this.referenceQueueArn()])];
    }

    private appendFunctions(): void {
        // The default batch size is 1
        const batchSize = this.configuration.batchSize ?? 1;

        // Override events for the worker
        this.configuration.worker.events = [
            // Subscribe the worker to the SQS queue
            {
                sqs: {
                    arn: this.referenceQueueArn(),
                    batchSize: batchSize,
                    // TODO add setting
                    maximumBatchingWindow: 60,
                },
            },
        ];
        this.provider.addFunction(`${this.id}Worker`, this.configuration.worker);
    }

    private referenceQueueArn(): Record<string, unknown> {
        return this.provider.getCloudFormationReference(this.queue.queueArn);
    }

    private referenceQueueUrl(): Record<string, unknown> {
        return this.provider.getCloudFormationReference(this.queue.queueUrl);
    }

    private async getQueueUrl(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.queueUrlOutput);
    }

    async getDlqUrl(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.dlqUrlOutput);
    }
}
