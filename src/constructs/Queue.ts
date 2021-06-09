import { Queue as CdkQueue } from "@aws-cdk/aws-sqs";
import { FromSchema } from "json-schema-to-ts";
import { Alarm, ComparisonOperator, Metric } from "@aws-cdk/aws-cloudwatch";
import { Subscription, SubscriptionProtocol, Topic } from "@aws-cdk/aws-sns";
import { AlarmActionConfig } from "@aws-cdk/aws-cloudwatch/lib/alarm-action";
import { Construct as CdkConstruct, CfnOutput, Duration } from "@aws-cdk/core";
import chalk from "chalk";
import {
    DeleteMessageBatchRequest,
    DeleteMessageBatchResult,
    Message,
    PurgeQueueRequest,
    ReceiveMessageRequest,
    ReceiveMessageResult,
    SendMessageBatchRequest,
    SendMessageBatchResult,
} from "aws-sdk/clients/sqs";
import ora from "ora";
import { PolicyStatement } from "../Stack";
import Construct from "../classes/Construct";
import AwsProvider from "../classes/AwsProvider";
import { log } from "../utils/logger";
import { sleep } from "../utils/sleep";

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
            description: `URL of the "${id}" SQS dead letter queue.`,
            value: dlq.queueUrl,
        });

        this.appendFunctions();
    }

    commands(): Record<string, () => void | Promise<void>> {
        return {
            failed: () => this.listDlq(),
            "failed:clear": () => this.clearDlq(),
            "failed:retry": () => this.retryDlq(),
        };
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

    async listDlq(): Promise<void> {
        const queueUrl = await this.getDlqUrl();
        if (queueUrl === undefined) {
            console.log(
                chalk.red('Could not find the queue in the deployed stack. Try running "serverless deploy" first?')
            );

            return;
        }
        const progress = ora("Polling failed messages from the dead letter queue").start();
        const messages: Message[] = [];
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(
                this.pollMessages(queueUrl, messages).then(() => {
                    progress.text = `Polling failed messages from the dead letter queue (${messages.length} found)`;
                })
            );
            await sleep(200);
        }
        await Promise.all(promises);
        if (messages.length === 0) {
            progress.succeed("👌 No failed messages found in the dead letter queue");

            return;
        }
        progress.warn(`${messages.length} messages found in the dead letter queue:`);
        for (const message of messages) {
            console.log(chalk.yellow(`Message #${message.MessageId ?? "?"}`));
            if (message.Attributes !== undefined) {
                console.log(chalk.gray(JSON.stringify(message.Attributes)));
            }
            if (message.MessageAttributes !== undefined) {
                console.log(chalk.gray(JSON.stringify(message.MessageAttributes)));
            }
            console.log(this.formatMessageBody(message.Body ?? ""));
            console.log();
        }
    }

    private async pollMessages(queueUrl: string, messages: Message[]): Promise<boolean> {
        const messagesResponse = await this.provider.request<ReceiveMessageRequest, ReceiveMessageResult>(
            "SQS",
            "receiveMessage",
            {
                QueueUrl: queueUrl,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 5,
                // Only hide messages for 1 second
                VisibilityTimeout: 1,
            }
        );
        let foundNewMessages = false;
        for (const newMessage of messagesResponse.Messages ?? []) {
            const alreadyInTheList = messages.some((message) => {
                return message.MessageId === newMessage.MessageId;
            });
            if (!alreadyInTheList) {
                messages.push(newMessage);
                foundNewMessages = true;
            }
        }

        return foundNewMessages;
    }

    async clearDlq(): Promise<void> {
        const queueUrl = await this.getDlqUrl();
        if (queueUrl === undefined) {
            return;
        }
        log(`Clearing dead letter queue ${queueUrl}`);
        await this.provider.request<PurgeQueueRequest, void>("SQS", "purgeQueue", {
            QueueUrl: queueUrl,
        });
        log("Failed messages have been cleared 🙈");
    }

    async retryDlq(): Promise<void> {
        const queueUrl = await this.getQueueUrl();
        const dlqUrl = await this.getDlqUrl();
        if (queueUrl === undefined || dlqUrl === undefined) {
            return;
        }
        console.log(chalk.yellow("Moving failed messages from DLQ to the main queue to be retried"));
        // TODO loop until there are no more messages
        const messagesResponse = await this.provider.request<ReceiveMessageRequest, ReceiveMessageResult>(
            "SQS",
            "receiveMessage",
            {
                QueueUrl: dlqUrl,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 2,
                VisibilityTimeout: 2,
            }
        );
        const messages = messagesResponse.Messages;
        if (!messages) {
            console.log("No failed messages found");

            return;
        }
        const sendResult = await this.provider.request<SendMessageBatchRequest, SendMessageBatchResult>(
            "SQS",
            "sendMessageBatch",
            {
                QueueUrl: queueUrl,
                Entries: messages.map((message) => {
                    return {
                        Id: message.MessageId as string,
                        MessageAttributes: message.MessageAttributes,
                        MessageBody: message.Body as string,
                    };
                }),
            }
        );
        sendResult.Failed;
        if (sendResult.Failed.length > 0) {
            log(
                `Couldn't retry ${sendResult.Failed.length} failed messages (for some unknown reason SQS refused to move them). These messages are still in the dead letter queue. Maybe try again?`
            );
        }
        const deletionResult = await this.provider.request<DeleteMessageBatchRequest, DeleteMessageBatchResult>(
            "SQS",
            "deleteMessageBatch",
            {
                QueueUrl: dlqUrl,
                // TODO only delete successful "sent" messages here
                Entries: messages.map((message) => {
                    return {
                        Id: message.MessageId as string,
                        ReceiptHandle: message.ReceiptHandle as string,
                    };
                }),
            }
        );
        if (deletionResult.Failed.length > 0) {
            log(
                `${deletionResult.Failed.length} failed messages were not successfully deleted from the dead letter queue. These messages will be retried in the main queue, but they will also still be present in the dead letter queue.`
            );
        }
        log(`${messages.length} failed messages have been moved to the main queue to be retried 💪`);
    }

    private formatMessageBody(body: string): string {
        try {
            // If it's valid JSON, we'll format it nicely
            const data = JSON.parse(body) as unknown;

            return JSON.stringify(data, null, 2);
        } catch (e) {
            // If it's not valid JSON, we'll print the body as-is
            return body;
        }
    }
}
