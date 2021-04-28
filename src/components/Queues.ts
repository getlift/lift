import { CfnOutput, Construct, Duration, Stack } from "@aws-cdk/core";
import chalk from "chalk";
import { Queue } from "@aws-cdk/aws-sqs";
import { FromSchema } from "json-schema-to-ts";
import { Component } from "../classes/Component";
import { Serverless } from "../types/serverless";
import { cfGetAtt, formatCloudFormationId, getStackOutput } from "../CloudFormation";
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
    },
    additionalProperties: false,
    required: ["worker"],
} as const;
const COMPONENT_DEFINITIONS = {
    type: "object",
    patternProperties: {
        [LIFT_COMPONENT_NAME_PATTERN]: COMPONENT_DEFINITION,
    },
} as const;
type ComponentConfiguration = FromSchema<typeof COMPONENT_DEFINITION>;

export class Queues extends Component<typeof COMPONENT_NAME, typeof COMPONENT_DEFINITIONS> {
    constructor(serverless: Serverless) {
        super({
            name: COMPONENT_NAME,
            serverless,
            schema: COMPONENT_DEFINITIONS,
        });

        this.hooks["before:aws:info:displayStackOutputs"] = this.info.bind(this);

        this.appendFunctions();
    }

    appendFunctions(): void {
        Object.entries(this.getConfiguration()).map(([name, queueConfiguration]) => {
            const cfId = formatCloudFormationId(`${name}`);
            // Override events for the worker
            queueConfiguration.worker.events = [
                // Subscribe the worker to the SQS queue
                {
                    sqs: {
                        arn: cfGetAtt(`${cfId}Queue`, "Arn"),
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
            new QueueConstruct(this, name, this.getStackName(), queueConfig, this.serverless);
        });
    }

    async info(): Promise<void> {
        const getAllQueues = Object.keys(this.getConfiguration()).map(async (name) => {
            const queue = this.node.tryFindChild(name) as QueueConstruct;

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
        return Object.keys(this.getConfiguration()).map((name) => {
            const queue = this.node.tryFindChild(name) as QueueConstruct;

            return new PolicyStatement("sqs:SendMessage", [queue.referenceQueueArn()]);
        });
    }
}

class QueueConstruct extends Construct {
    private readonly queue: Queue;
    private readonly queueArnOutput: CfnOutput;
    private readonly queueUrlOutput: CfnOutput;

    constructor(
        scope: Construct,
        name: string,
        stackName: string,
        readonly configuration: ComponentConfiguration,
        private serverless: Serverless
    ) {
        super(scope, name);

        // The default function timeout is 6 seconds in the Serverless Framework
        const functionTimeout = configuration.worker.timeout ?? 6;

        const maxRetries = configuration.maxRetries ?? 3;

        const dlq = new Queue(this, "Dlq", {
            queueName: stackName + "-" + name + "-dlq",
            // 14 days is the maximum, we want to keep these messages for as long as possible
            retentionPeriod: Duration.days(14),
        });

        this.queue = new Queue(this, "Queue", {
            queueName: stackName + "-" + name,
            // This should be 6 times the lambda function's timeout
            // See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
            visibilityTimeout: Duration.seconds(functionTimeout * 6),
            deadLetterQueue: {
                maxReceiveCount: maxRetries,
                queue: dlq,
            },
        });

        // CloudFormation outputs
        this.queueArnOutput = new CfnOutput(this, "QueueName", {
            description: `Name of the "${name}" SQS queue.`,
            value: this.queue.queueName,
        });
        this.queueUrlOutput = new CfnOutput(this, "QueueUrl", {
            description: `URL of the "${name}" SQS queue.`,
            value: this.queue.queueUrl,
        });
    }

    referenceQueueArn(): Record<string, unknown> {
        return Stack.of(this).resolve(this.queue.queueArn) as Record<string, unknown>;
    }

    async getQueueArn(): Promise<string | undefined> {
        return await getStackOutput(this.serverless, this.queueArnOutput.logicalId);
    }

    referenceQueueUrl(): Record<string, unknown> {
        return Stack.of(this).resolve(this.queue.queueUrl) as Record<string, unknown>;
    }

    async getQueueUrl(): Promise<string | undefined> {
        return await getStackOutput(this.serverless, this.queueUrlOutput.logicalId);
    }
}
