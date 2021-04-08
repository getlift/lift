import {Component} from "./Component";
import {PolicyStatement, Stack} from '../Stack';

export class Queue extends Component {
    private readonly name: string;
    private readonly queueName: string;
    private readonly props: Record<string, any>;
    private readonly queueResourceId: string;

    constructor(stack: Stack, name: string, props: Record<string, any> | null) {
        super(stack);
        this.name = name;
        this.queueName = this.formatUniqueResourceName(name);
        this.props = props ? props : {};

        this.queueResourceId = this.formatCloudFormationId(this.name + 'Queue');
    }

    compile(): Record<string, any> {
        const queue: any = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: this.queueName,
            },
        };

        if (this.props.visibilityTimeout) {
            queue.Properties.VisibilityTimeout = this.props.visibilityTimeout;
        }

        const resources: Record<string, any> = {
            [this.queueResourceId]: queue,
        };

        if (this.props.maxRetries) {
            resources[this.queueResourceId + 'DLQ'] = {
                Type: 'AWS::SQS::Queue',
                Properties: {
                    QueueName: this.queueName + '-dlq',
                    // Messages will be stored up to 14 days (the max)
                    MessageRetentionPeriod: 1209600,
                },
            };

            queue.Properties.RedrivePolicy = {
                maxReceiveCount: this.props.maxRetries,
                deadLetterTargetArn: this.fnGetAtt(this.queueResourceId + 'DLQ', 'Arn'),
            };
        }

        return resources;
    }

    outputs() {
        return {
            [this.queueResourceId + 'Url']: {
                Description: 'URL of the SQS queue.',
                Value: this.fnRef(this.queueResourceId),
            },
            [this.queueResourceId + 'Arn']: {
                Description: 'ARN of the SQS queue.',
                Value: this.fnGetAtt(this.queueResourceId, 'Arn'),
            },
        };
    }

    async permissionsReferences() {
        return [
            new PolicyStatement('sqs:SendMessage', [
                this.fnGetAtt(this.queueResourceId, 'Arn')
            ]),
        ];
    }
}
