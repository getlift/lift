import { Key } from "aws-cdk-lib/aws-kms";
import { Queue as CdkQueue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import type { FromSchema } from "json-schema-to-ts";
import { Alarm, ComparisonOperator, Metric } from "aws-cdk-lib/aws-cloudwatch";
import { Subscription, SubscriptionProtocol, Topic } from "aws-cdk-lib/aws-sns";
import type { AlarmActionConfig } from "aws-cdk-lib/aws-cloudwatch/lib/alarm-action";
import type { Construct as CdkConstruct } from "constructs";
import { CfnOutput, Duration } from "aws-cdk-lib";
import chalk from "chalk";
import type { PurgeQueueRequest, SendMessageRequest } from "aws-sdk/clients/sqs";
import { isNil } from "lodash";
import type { Ora } from "ora";
import ora from "ora";
import { spawnSync } from "child_process";
import * as inquirer from "inquirer";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import type { ConstructCommands } from "@lift/constructs";
import { pollMessages, retryMessages } from "./queue/sqs";
import { sleep } from "../../utils/sleep";
import { PolicyStatement } from "../../CloudFormation";
import type { CliOptions } from "../../types/serverless";
import ServerlessError from "../../utils/error";
import type { Progress } from "../../utils/logger";
import { getUtils } from "../../utils/logger";

const QUEUE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "queue" },
        worker: {
            type: "object",
            properties: {
                timeout: { type: "number" },
            },
            additionalProperties: true,
        },
        maxRetries: { type: "number" },
        alarm: { type: "string" },
        batchSize: {
            type: "number",
            minimum: 1,
            maximum: 10,
        },
        maxBatchingWindow: {
            type: "number",
            minimum: 0,
            maximum: 300,
        },
        fifo: { type: "boolean" },
        delay: { type: "number" },
        encryption: { type: "string" },
        encryptionKey: { type: "string" },
    },
    additionalProperties: false,
    required: ["worker"],
} as const;
type Configuration = FromSchema<typeof QUEUE_DEFINITION>;

export class Queue extends AwsConstruct {
    public static type = "queue";
    public static schema = QUEUE_DEFINITION;
    public static commands: ConstructCommands = {
        logs: {
            usage: "Output the logs of the queue's worker function",
            handler: Queue.prototype.displayLogs,
            options: {
                tail: {
                    usage: "Tail the log output",
                    shortcut: "t",
                    type: "boolean",
                },
                startTime: {
                    usage: "Logs before this time will not be displayed. Default: `10m` (last 10 minutes logs only)",
                    type: "string",
                },
                filter: {
                    usage: "A filter pattern",
                    type: "string",
                },
                interval: {
                    usage: "Tail polling interval in milliseconds. Default: `1000`",
                    shortcut: "i",
                    type: "string",
                },
            },
        },
        send: {
            usage: "Send a new message to the SQS queue",
            handler: Queue.prototype.sendMessage,
            options: {
                body: {
                    usage: "Body of the SQS message",
                    type: "string",
                },
                "group-id": {
                    usage: "This parameter applies only to FIFO (first-in-first-out) queues. The ID that specifies that a message belongs to a specific message group.",
                    type: "string",
                },
            },
        },
        failed: {
            usage: "List failed messages from the dead letter queue",
            handler: Queue.prototype.listDlq,
        },
        "failed:purge": {
            usage: "Purge failed messages from the dead letter queue",
            handler: Queue.prototype.purgeDlq,
        },
        "failed:retry": {
            usage: "Retry failed messages from the dead letter queue by moving them to the main queue",
            handler: Queue.prototype.retryDlq,
        },
    };

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

        // This should be covered by the schema validation, but until it is enforced by default
        // this is a very common error for users
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (configuration.worker === undefined) {
            throw new ServerlessError(
                `Invalid configuration in 'constructs.${this.id}': no 'worker' defined. Queue constructs require a 'worker' function to be defined.`,
                "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
            );
        }

        // The default function timeout is 6 seconds in the Serverless Framework
        const functionTimeout = configuration.worker.timeout ?? 6;

        // This should be 6 times the lambda function's timeout + MaximumBatchingWindowInSeconds
        // See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
        const visibilityTimeout = functionTimeout * 6 + this.getMaximumBatchingWindow();

        const maxRetries = configuration.maxRetries ?? 3;

        let delay = undefined;
        if (configuration.delay !== undefined) {
            if (configuration.delay < 0 || configuration.delay > 900) {
                throw new ServerlessError(
                    `Invalid configuration in 'constructs.${this.id}': 'delay' must be between 0 and 900, '${configuration.delay}' given.`,
                    "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
                );
            }

            delay = Duration.seconds(configuration.delay);
        }

        let encryption = undefined;
        if (isNil(configuration.encryption) || configuration.encryption.length === 0) {
            encryption = {};
        } else if (configuration.encryption === "kmsManaged") {
            encryption = { encryption: QueueEncryption.KMS_MANAGED };
        } else if (configuration.encryption === "kms") {
            if (isNil(configuration.encryptionKey) || configuration.encryptionKey.length === 0) {
                throw new ServerlessError(
                    `Invalid configuration in 'constructs.${this.id}': 'encryptionKey' must be set if the 'encryption' is set to 'kms'`,
                    "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
                );
            }
            encryption = {
                encryption: QueueEncryption.KMS,
                encryptionMasterKey: new Key(this, configuration.encryptionKey),
            };
        } else {
            throw new ServerlessError(
                `Invalid configuration in 'constructs.${this.id}': 'encryption' must be one of 'kms', 'kmsManaged', null, '${configuration.encryption}' given.`,
                "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
            );
        }

        const baseName = `${this.provider.stackName}-${id}`;

        const dlq = new CdkQueue(this, "Dlq", {
            queueName: configuration.fifo === true ? `${baseName}-dlq.fifo` : `${baseName}-dlq`,
            // 14 days is the maximum, we want to keep these messages for as long as possible
            retentionPeriod: Duration.days(14),
            fifo: configuration.fifo,
            ...encryption,
        });

        this.queue = new CdkQueue(this, "Queue", {
            queueName: configuration.fifo === true ? `${baseName}.fifo` : `${baseName}`,
            visibilityTimeout: Duration.seconds(visibilityTimeout),
            deadLetterQueue: {
                maxReceiveCount: maxRetries,
                queue: dlq,
            },
            fifo: configuration.fifo,
            deliveryDelay: delay,
            contentBasedDeduplication: configuration.fifo,
            ...encryption,
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
                    dimensionsMap: {
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

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            queueUrl: () => this.getQueueUrl(),
        };
    }

    variables(): Record<string, unknown> {
        return {
            queueUrl: this.queue.queueUrl,
            queueArn: this.queue.queueArn,
        };
    }

    permissions(): PolicyStatement[] {
        return [new PolicyStatement("sqs:SendMessage", [this.queue.queueArn])];
    }

    private getMaximumBatchingWindow(): number {
        return this.configuration.maxBatchingWindow ?? 0;
    }

    private appendFunctions(): void {
        // The default batch size is 1
        const batchSize = this.configuration.batchSize ?? 1;
        const maximumBatchingWindow = this.getMaximumBatchingWindow();

        // Override events for the worker
        this.configuration.worker.events = [
            // Subscribe the worker to the SQS queue
            {
                sqs: {
                    arn: this.queue.queueArn,
                    batchSize: batchSize,
                    maximumBatchingWindow: maximumBatchingWindow,
                    functionResponseType: "ReportBatchItemFailures",
                },
            },
        ];
        this.provider.addFunction(`${this.id}Worker`, this.configuration.worker);
    }

    private async getQueueUrl(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.queueUrlOutput);
    }

    async getDlqUrl(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.dlqUrlOutput);
    }

    async listDlq(): Promise<void> {
        const dlqUrl = await this.getDlqUrl();
        if (dlqUrl === undefined) {
            throw new ServerlessError(
                'Could not find the dead letter queue in the deployed stack. Try running "serverless deploy" first?',
                "LIFT_MISSING_STACK_OUTPUT"
            );
        }
        const progress = getUtils().progress;
        let progressV2: Ora | undefined;
        let progressV3: Progress | undefined;
        if (progress) {
            progressV3 = progress.create({
                message: "Polling failed messages from the dead letter queue",
            });
        } else {
            progressV2 = ora("Polling failed messages from the dead letter queue").start();
        }
        const messages = await pollMessages({
            aws: this.provider,
            queueUrl: dlqUrl,
            progressCallback: (numberOfMessagesFound) => {
                if (progressV2) {
                    progressV2.text = `Polling failed messages from the dead letter queue (${numberOfMessagesFound} found)`;
                } else if (progressV3) {
                    progressV3.update(
                        `Polling failed messages from the dead letter queue (${numberOfMessagesFound} found)`
                    );
                }
            },
        });
        if (progressV3) {
            progressV3.remove();
        }
        if (messages.length === 0) {
            if (progressV2) {
                progressV2.stopAndPersist({
                    symbol: "👌",
                    text: "No failed messages found in the dead letter queue",
                });
            } else {
                getUtils().log.success("No failed messages found in the dead letter queue");
            }

            return;
        }
        if (progressV2) {
            progressV2.warn(`${messages.length} messages found in the dead letter queue:`);
        } else {
            getUtils().log(`${messages.length} messages found in the dead letter queue:`);
            getUtils().log();
        }
        for (const message of messages) {
            getUtils().writeText(chalk.gray(`Message #${message.MessageId ?? "?"}`));
            getUtils().writeText(this.formatMessageBody(message.Body ?? ""));
            getUtils().writeText();
        }
        const retryCommand = chalk.bold(`serverless ${this.id}:failed:retry`);
        const purgeCommand = chalk.bold(`serverless ${this.id}:failed:purge`);
        getUtils().log(
            `Run ${retryCommand} to retry all messages, or ${purgeCommand} to delete those messages forever.`
        );
    }

    async purgeDlq(): Promise<void> {
        const dlqUrl = await this.getDlqUrl();
        if (dlqUrl === undefined) {
            throw new ServerlessError(
                'Could not find the dead letter queue in the deployed stack. Try running "serverless deploy" first?',
                "LIFT_MISSING_STACK_OUTPUT"
            );
        }
        const progress = getUtils().progress;
        let progressV2: Ora | undefined;
        let progressV3: Progress | undefined;
        if (progress) {
            progressV3 = progress.create({
                message: "Purging the dead letter queue of failed messages",
            });
        } else {
            progressV2 = ora("Purging the dead letter queue of failed messages").start();
        }
        await this.provider.request<PurgeQueueRequest, void>("SQS", "purgeQueue", {
            QueueUrl: dlqUrl,
        });
        /**
         * Sometimes messages are still returned after the purge is issued.
         * For a less confusing experience, we wait 500ms so that if the user re-runs `sls queue:failed` there
         * are less chances that deleted messages show up again.
         */
        await sleep(500);
        if (progressV3) {
            progressV3.remove();
            getUtils().log.success("The dead letter queue has been purged, failed messages are gone 🙈");
        } else if (progressV2) {
            progressV2.succeed("The dead letter queue has been purged, failed messages are gone 🙈");
        }
    }

    async retryDlq(): Promise<void> {
        const queueUrl = await this.getQueueUrl();
        const dlqUrl = await this.getDlqUrl();
        if (queueUrl === undefined || dlqUrl === undefined) {
            throw new ServerlessError(
                'Could not find the queue in the deployed stack. Try running "serverless deploy" first?',
                "LIFT_MISSING_STACK_OUTPUT"
            );
        }
        const progress = getUtils().progress;
        let progressV2: Ora | undefined;
        let progressV3: Progress | undefined;
        if (progress) {
            progressV3 = progress.create({
                message: "Moving failed messages from DLQ to the main queue to be retried",
            });
        } else {
            progressV2 = ora("Moving failed messages from DLQ to the main queue to be retried").start();
        }
        let shouldContinue = true;
        let totalMessagesToRetry = 0;
        let totalMessagesRetried = 0;
        do {
            const messages = await pollMessages({
                aws: this.provider,
                queueUrl: dlqUrl,
                /**
                 * Since we intend on deleting the messages, we'll reserve them for 10 seconds
                 * That avoids having those message reappear in the `do` loop, because SQS sometimes
                 * takes a while to actually delete messages.
                 */
                visibilityTimeout: 10,
            });
            totalMessagesToRetry += messages.length;
            if (progressV3) {
                progressV3.update(
                    `Moving failed messages from DLQ to the main queue to be retried (${totalMessagesRetried}/${totalMessagesToRetry})`
                );
            } else if (progressV2) {
                progressV2.text = `Moving failed messages from DLQ to the main queue to be retried (${totalMessagesRetried}/${totalMessagesToRetry})`;
            }

            const result = await retryMessages(this.provider, queueUrl, dlqUrl, messages);
            totalMessagesRetried += result.numberOfMessagesRetried;
            if (progressV3) {
                progressV3.update(
                    `Moving failed messages from DLQ to the main queue to be retried (${totalMessagesRetried}/${totalMessagesToRetry})`
                );
            } else if (progressV2) {
                progressV2.text = `Moving failed messages from DLQ to the main queue to be retried (${totalMessagesRetried}/${totalMessagesToRetry})`;
            }

            // Stop if we have any failure (that simplifies the flow for now)
            if (result.numberOfMessagesRetriedButNotDeleted > 0 || result.numberOfMessagesNotRetried > 0) {
                if (progressV3) {
                    progressV3.remove();
                    getUtils().log.error(`There were some errors:`);
                } else if (progressV2) {
                    progressV2.fail(`There were some errors:`);
                }
                if (totalMessagesRetried > 0) {
                    console.log(
                        `${totalMessagesRetried} failed messages have been successfully moved to the main queue to be retried.`
                    );
                }
                if (result.numberOfMessagesNotRetried > 0) {
                    console.log(
                        `${result.numberOfMessagesNotRetried} failed messages could not be retried (for some unknown reason SQS refused to move them). These messages are still in the dead letter queue. Maybe try again?`
                    );
                }
                if (result.numberOfMessagesRetriedButNotDeleted > 0) {
                    console.log(
                        `${result.numberOfMessagesRetriedButNotDeleted} failed messages were moved to the main queue, but were not successfully deleted from the dead letter queue. That means that these messages will be retried in the main queue, but they will also still be present in the dead letter queue.`
                    );
                }
                console.log(
                    "Stopping now because of the error above. Not all messages have been retried, run the command again to continue."
                );

                return;
            }

            shouldContinue = result.numberOfMessagesRetried > 0;
        } while (shouldContinue);

        if (totalMessagesToRetry === 0) {
            if (progressV3) {
                progressV3.remove();
                getUtils().log.success("No failed messages found in the dead letter queue");
            } else if (progressV2) {
                progressV2.stopAndPersist({
                    symbol: "👌",
                    text: "No failed messages found in the dead letter queue",
                });
            }

            return;
        }

        if (progressV3) {
            progressV3.remove();
            getUtils().log.success(
                `${totalMessagesRetried} failed message(s) moved to the main queue to be retried 💪`
            );
        } else if (progressV2) {
            progressV2.succeed(`${totalMessagesRetried} failed message(s) moved to the main queue to be retried 💪`);
        }
    }

    async sendMessage(options: CliOptions): Promise<void> {
        const queueUrl = await this.getQueueUrl();
        if (queueUrl === undefined) {
            throw new ServerlessError(
                'Could not find the queue in the deployed stack. Try running "serverless deploy" first?',
                "LIFT_MISSING_STACK_OUTPUT"
            );
        }

        if (this.configuration.fifo === true && typeof options["group-id"] !== "string") {
            throw new ServerlessError(
                `The '${this.id}' queue is a FIFO queue. You must set the SQS message group ID via the '--group-id' option.`,
                "LIFT_MISSING_CLI_OPTION"
            );
        }

        const body = typeof options.body === "string" ? options.body : await this.askMessageBody();

        const params: SendMessageRequest = {
            QueueUrl: queueUrl,
            MessageBody: body,
        };
        if (this.configuration.fifo === true) {
            // Type validated above
            params.MessageGroupId = options["group-id"] as string;
        }

        await this.provider.request<SendMessageRequest, never>("SQS", "sendMessage", params);

        getUtils().log.success("Message sent to SQS");
    }

    displayLogs(options: CliOptions): void {
        const args = ["logs", "--function", `${this.id}Worker`];
        for (const [option, value] of Object.entries(options)) {
            args.push(option.length === 1 ? `-${option}` : `--${option}`);
            if (typeof value === "string") {
                args.push(value);
            }
        }
        getUtils().log(chalk.gray(`serverless ${args.join(" ")}`));
        args.unshift(process.argv[1]);
        spawnSync(process.argv[0], args, {
            cwd: process.cwd(),
            stdio: "inherit",
        });
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

    private async askMessageBody(): Promise<string> {
        const responses = await inquirer.prompt({
            message: "What is the body of the SQS message to send (can be JSON or any string)",
            type: "editor",
            name: "body",
            validate: (input: string) => {
                return input.length > 0 ? true : "The message body cannot be empty";
            },
        });

        return (responses.body as string).trim();
    }
}
