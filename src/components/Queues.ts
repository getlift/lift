import { CfnOutput, Duration } from "@aws-cdk/core";
import chalk from "chalk";
import { Queue } from "@aws-cdk/aws-sqs";
import { Component } from "../classes/Component";
import { Serverless } from "../types/serverless";
import {
    cfGetAtt,
    formatCloudFormationId,
    getStackOutput,
} from "../CloudFormation";
import { PolicyStatement } from "../Stack";

const LIFT_COMPONENT_NAME_PATTERN = "^[a-zA-Z0-9-_]+$";
const COMPONENT_NAME = "queues";
const COMPONENT_DEFINITION = {
    type: "object",
    properties: {
        worker: { type: "object" },
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

export class Queues extends Component<
    typeof COMPONENT_NAME,
    typeof COMPONENT_DEFINITIONS
> {
    constructor(serverless: Serverless) {
        super({
            name: COMPONENT_NAME,
            serverless,
            schema: COMPONENT_DEFINITIONS,
        });

        this.hooks["after:info:info"] = this.info.bind(this);
        this.appendFunctions();
    }

    appendFunctions(): void {
        const configuration = this.getConfiguration() ?? {};
        Object.entries(configuration).map(([name, queueConfiguration]) => {
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
        const configuration = this.getConfiguration() ?? {};

        Object.entries(configuration).map(([name]) => {
            const cfId = formatCloudFormationId(`${name}`);

            const dlq = new Queue(this.serverless.stack, `${cfId}Dlq`, {
                queueName: this.getStackName() + "-" + name + "-dlq",
                // 14 days is the maximum, we want to keep these messages for as long as possible
                retentionPeriod: Duration.days(14),
            });

            const queue = new Queue(this.serverless.stack, `${cfId}Queue`, {
                queueName: this.getStackName() + "-" + name,
                // TODO
                visibilityTimeout: Duration.seconds(10),
                retentionPeriod: Duration.seconds(60),
                deadLetterQueue: {
                    maxReceiveCount: 3,
                    queue: dlq,
                },
            });

            // CloudFormation outputs
            new CfnOutput(this.serverless.stack, `${cfId}QueueName`, {
                description: `Name of the "${name}" SQS queue.`,
                value: queue.queueName,
            });
            new CfnOutput(this.serverless.stack, `${cfId}QueueUrl`, {
                description: `URL of the "${name}" SQS queue.`,
                value: queue.queueUrl,
            });
        });
    }

    async info(): Promise<void> {
        const getAllQueues = Object.keys(this.getConfiguration() ?? {}).map(
            async (name) => {
                const cfId = formatCloudFormationId(`${name}`);

                return await getStackOutput(this.serverless, `${cfId}QueueUrl`);
            }
        );
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
        const configuration = this.getConfiguration() ?? {};

        return Object.entries(configuration).map(([name]) => {
            const cfId = formatCloudFormationId(`${name}`);

            return new PolicyStatement("sqs:SendMessage", [
                cfGetAtt(`${cfId}Queue`, "Arn"),
            ]);
        });
    }
}
