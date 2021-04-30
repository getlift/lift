import { CfnOutput, Construct, Duration } from "@aws-cdk/core";
import chalk from "chalk";
import { Queue } from "@aws-cdk/aws-sqs";
import { FromSchema } from "json-schema-to-ts";
import { Alarm, ComparisonOperator, Metric } from "@aws-cdk/aws-cloudwatch";
import { Subscription, SubscriptionProtocol, Topic } from "@aws-cdk/aws-sns";
import { AlarmActionConfig } from "@aws-cdk/aws-cloudwatch/lib/alarm-action";
import { has } from "lodash";
import { Component, ComponentConstruct } from "../classes/Component";
import { Serverless } from "../types/serverless";
import { PolicyStatement } from "../Stack";

const LIFT_COMPONENT_NAME_PATTERN = "^[a-zA-Z0-9-_]+$";
const COMPONENT_NAME = "queues";
const COMPONENT_DEFINITION = {
    type: "object",
    properties: {
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
    },
    additionalProperties: false,
    required: ["worker"],
} as const;
const COMPONENT_DEFINITIONS = {
    type: "object",
    minProperties: 1,
    patternProperties: {
        [LIFT_COMPONENT_NAME_PATTERN]: COMPONENT_DEFINITION,
    },
    additionalProperties: false,
} as const;
type ComponentConfiguration = FromSchema<typeof COMPONENT_DEFINITION>;

export class Queues extends Component<typeof COMPONENT_NAME, typeof COMPONENT_DEFINITIONS, QueueConstruct> {
    constructor(serverless: Serverless) {
        super({
            name: COMPONENT_NAME,
            serverless,
            schema: COMPONENT_DEFINITIONS,
        });

        this.hooks["before:aws:info:displayStackOutputs"] = this.info.bind(this);

        this.configurationVariablesSources = {
            [COMPONENT_NAME]: {
                resolve: this.resolveVariable.bind(this),
            },
        };

        this.appendFunctions();
    }

    appendFunctions(): void {
        Object.entries(this.getConfiguration()).map(([name, queueConfiguration]) => {
            const queue = this.node.tryFindChild(name) as QueueConstruct;

            // Override events for the worker
            queueConfiguration.worker.events = [
                // Subscribe the worker to the SQS queue
                {
                    sqs: {
                        arn: queue.referenceQueueArn(),
                        // TODO set good defaults
                        batchSize: 1,
                        maximumBatchingWindow: 60,
                    },
                },
            ];
            Object.assign(this.serverless.service.functions, {
                [`${name}Worker`]: queueConfiguration.worker,
            });
        });
    }

    compile(): void {
        Object.entries(this.getConfiguration()).map(([name, queueConfig]) => {
            new QueueConstruct(this, name, this.serverless, queueConfig);
        });
    }

    async info(): Promise<void> {
        const getAllQueues = this.getComponents().map(async (queue) => {
            return await queue.getQueueUrl();
        });
        const queues: string[] = (await Promise.all(getAllQueues)).filter(
            (queue): queue is string => queue !== undefined
        );
        if (queues.length <= 0) {
            return;
        }
        console.log(chalk.yellow("queues:"));
        for (const queue of queues) {
            console.log(`  ${queue}`);
        }
    }

    permissions(): PolicyStatement[] {
        return this.getComponents().map((queue) => {
            return new PolicyStatement("sqs:SendMessage", [queue.referenceQueueArn()]);
        });
    }

    resolveVariable({ address }: { address: string }): { value: Record<string, unknown> } {
        const [id, property] = address.split(".", 2);

        const configuration = this.getConfiguration();
        if (!has(configuration, id)) {
            throw new Error(
                `No queue named ${id} configured in service file. Available components are: ${Object.keys(
                    configuration
                ).join(", ")}.`
            );
        }
        const queue = this.node.tryFindChild(id) as QueueConstruct;

        const properties = queue.exposedVariables();
        if (!has(properties, id)) {
            throw new Error(
                `\${${this.getName()}:${id}.${property}} does not exist. Properties available on \${${this.getName()}:${id}} are: ${Object.keys(
                    properties
                ).join(", ")}.`
            );
        }

        return {
            value: properties[property](),
        };
    }
}

class QueueConstruct extends ComponentConstruct {
    private readonly queue: Queue;
    private readonly queueArnOutput: CfnOutput;
    private readonly queueUrlOutput: CfnOutput;

    constructor(scope: Construct, id: string, serverless: Serverless, readonly configuration: ComponentConfiguration) {
        super(scope, id, serverless);

        // The default function timeout is 6 seconds in the Serverless Framework
        const functionTimeout = configuration.worker.timeout ?? 6;

        const maxRetries = configuration.maxRetries ?? 3;

        const dlq = new Queue(this, "Dlq", {
            queueName: this.stackName + "-" + id + "-dlq",
            // 14 days is the maximum, we want to keep these messages for as long as possible
            retentionPeriod: Duration.days(14),
        });

        this.queue = new Queue(this, "Queue", {
            queueName: this.stackName + "-" + id,
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
                topicName: this.stackName + "-" + id + "-dlq-alarm-topic",
                displayName: `[Alert][${id}] There are failed jobs in the dead letter queue.`,
            });
            new Subscription(this, "AlarmTopicSubscription", {
                topic: alarmTopic,
                protocol: SubscriptionProtocol.EMAIL,
                endpoint: alarmEmail,
            });

            const alarm = new Alarm(this, "Alarm", {
                alarmName: this.stackName + "-" + id + "-dlq-alarm",
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
        this.queueArnOutput = new CfnOutput(this, "QueueName", {
            description: `Name of the "${id}" SQS queue.`,
            value: this.queue.queueName,
        });
        this.queueUrlOutput = new CfnOutput(this, "QueueUrl", {
            description: `URL of the "${id}" SQS queue.`,
            value: this.queue.queueUrl,
        });
    }

    referenceQueueArn(): Record<string, unknown> {
        return this.getCloudFormationReference(this.queue.queueArn);
    }

    referenceQueueUrl(): Record<string, unknown> {
        return this.getCloudFormationReference(this.queue.queueUrl);
    }

    async getQueueUrl(): Promise<string | undefined> {
        return this.getOutputValue(this.queueUrlOutput);
    }

    exposedVariables(): Record<string, () => Record<string, unknown>> {
        return {
            queueArn: () => this.referenceQueueArn(),
            queueUrl: () => this.referenceQueueUrl(),
        };
    }
}
