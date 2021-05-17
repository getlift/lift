import {CfnOutput, CfnResource} from "@aws-cdk/core";
import { Queue } from "@aws-cdk/aws-sqs";
import { Serverless } from "../../src/types/serverless";
import { PolicyStatement } from "../../src/Stack";
import {AwsComponent} from './Aws';

export class AwsQueue extends AwsComponent {
    private queue: Queue;
    private queueUrlOutput: CfnOutput;

    constructor(serverless: Serverless, id: string, configuration: any) {
        super(serverless, id, configuration);

        // CDK
        this.queue = new Queue(this.cdkNode, "Queue", {
            // ...
        });
        this.queueUrlOutput = new CfnOutput(this.cdkNode, "QueueUrl", {
            description: `URL of the "${id}" SQS queue.`,
            value: this.queue.queueUrl,
        });
        // Raw CloudFormation is also possible:
        new CfnResource(this.cdkNode, "EdgeFunction", {
            type: "AWS::CloudFront::Function",
            properties: {
                FunctionConfig: {
                    Comment: "",
                    Runtime: "cloudfront-js-1.0",
                },
                // ...
            },
        });

        this.appendFunctions();
    }

    commands() {
        return {
            // sls queue:clear
            // sls queue:clear -c <component-name>
            'queue:clear': this.clearQueue.bind(this),
        };
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            queueUrl: () => this.getQueueUrl(),
        };
    }

    async getQueueUrl(): Promise<string | undefined> {
        return this.getOutputValue(this.queueUrlOutput);
    }

    references(): Record<string, () => Record<string, unknown>> {
        return {
            queueArn: this.referenceQueueArn.bind(this),
            queueUrl: this.referenceQueueUrl.bind(this),
        };
    }

    referenceQueueArn(): Record<string, unknown> {
        return this.getCloudFormationReference(this.queue.queueArn);
    }

    referenceQueueUrl(): Record<string, unknown> {
        return this.getCloudFormationReference(this.queue.queueUrl);
    }

    appendFunctions(): void {
        // Override events for the worker
        this.configuration.worker.events = [
            // Subscribe the worker to the SQS queue
            {
                sqs: {
                    arn: this.referenceQueueArn(),
                    // ...
                },
            },
        ];
        Object.assign(this.serverless.service.functions, {
            [`${this.id}Worker`]: this.configuration.worker,
        });
    }

    async info() {
        const url = await this.getQueueUrl();
        return `${this.id}: ${url}`;
    }

    lambdaPermissions(): PolicyStatement[] {
        return [
            new PolicyStatement("sqs:SendMessage", [this.referenceQueueArn()])
        ];
    }

    clearQueue() {
        // ...
    }
}
