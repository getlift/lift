import { merge } from "lodash";
import * as sinon from "sinon";
import type { DeleteMessageBatchResult, ReceiveMessageResult, SendMessageBatchResult } from "aws-sdk/clients/sqs";
import * as CloudFormationHelpers from "../../src/CloudFormation";
import { pluginConfigExt, runServerless } from "../utils/runServerless";
import { mockAws } from "../utils/mockAws";

describe("queues", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("should create all required resources", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "queues",
            configExt: pluginConfigExt,
            command: "package",
        });

        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            // Lambda worker
            "EmailsWorkerLogGroup",
            "IamRoleLambdaExecution",
            "EmailsWorkerLambdaFunction",
            // Lambda subscription to SQS
            "EmailsWorkerEventSourceMappingSQSEmailsQueueF057328A",
            // Queues
            "emailsDlq47F8494C",
            "emailsQueueF057328A",
        ]);
        const s = computeLogicalId("emails", "Queue");
        expect(cfTemplate.Resources[s]).toMatchObject({
            DeletionPolicy: "Delete",
            Properties: {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                QueueName: expect.stringMatching(/test-queues-\w+-dev-emails/),
                RedrivePolicy: {
                    deadLetterTargetArn: {
                        "Fn::GetAtt": [computeLogicalId("emails", "Dlq"), "Arn"],
                    },
                    maxReceiveCount: 3,
                },
                VisibilityTimeout: 36,
            },
            Type: "AWS::SQS::Queue",
            UpdateReplacePolicy: "Delete",
        });
        expect(cfTemplate.Resources[computeLogicalId("emails", "Dlq")]).toMatchObject({
            DeletionPolicy: "Delete",
            Properties: {
                MessageRetentionPeriod: 1209600,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                QueueName: expect.stringMatching(/test-queues-\w+-dev-emails-dlq/),
            },
            Type: "AWS::SQS::Queue",
            UpdateReplacePolicy: "Delete",
        });
        expect(cfTemplate.Resources.EmailsWorkerLambdaFunction).toMatchObject({
            DependsOn: ["EmailsWorkerLogGroup"],
            Properties: {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                FunctionName: expect.stringMatching(/test-queues-\w+-dev-emailsWorker/),
                Handler: "worker.handler",
                MemorySize: 1024,
                Role: {
                    "Fn::GetAtt": ["IamRoleLambdaExecution", "Arn"],
                },
                Runtime: "nodejs12.x",
                Timeout: 6,
            },
            Type: "AWS::Lambda::Function",
        });
        expect(cfTemplate.Resources.EmailsWorkerEventSourceMappingSQSEmailsQueueF057328A).toEqual({
            DependsOn: ["IamRoleLambdaExecution"],
            Properties: {
                BatchSize: 1,
                Enabled: true,
                EventSourceArn: {
                    "Fn::GetAtt": [computeLogicalId("emails", "Queue"), "Arn"],
                },
                FunctionName: {
                    "Fn::GetAtt": ["EmailsWorkerLambdaFunction", "Arn"],
                },
                MaximumBatchingWindowInSeconds: 60,
            },
            Type: "AWS::Lambda::EventSourceMapping",
        });
        expect(cfTemplate.Outputs).toMatchObject({
            [computeLogicalId("emails", "QueueArn")]: {
                Description: 'ARN of the "emails" SQS queue.',
                Value: {
                    "Fn::GetAtt": [computeLogicalId("emails", "Queue"), "Arn"],
                },
            },
            [computeLogicalId("emails", "QueueUrl")]: {
                Description: 'URL of the "emails" SQS queue.',
                Value: {
                    Ref: computeLogicalId("emails", "Queue"),
                },
            },
        });
        // Lambda functions of the app are authorized to publish to SQS
        expect(cfTemplate.Resources.IamRoleLambdaExecution).toMatchObject({
            Type: "AWS::IAM::Role",
            Properties: {
                Policies: [
                    {
                        PolicyDocument: {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            Statement: expect.arrayContaining([
                                {
                                    Action: "sqs:SendMessage",
                                    Effect: "Allow",
                                    Resource: [
                                        {
                                            "Fn::GetAtt": [computeLogicalId("emails", "Queue"), "Arn"],
                                        },
                                    ],
                                },
                            ]),
                        },
                    },
                ],
            },
        });
    });

    it("sets the SQS visibility timeout to 6 times the function timeout", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "queues",
            configExt: merge(pluginConfigExt, {
                constructs: {
                    emails: {
                        worker: {
                            timeout: 7,
                        },
                    },
                },
            }),
            command: "package",
        });
        expect(cfTemplate.Resources[computeLogicalId("emails", "Queue")]).toMatchObject({
            Properties: {
                VisibilityTimeout: 7 * 6,
            },
        });
        expect(cfTemplate.Resources.EmailsWorkerLambdaFunction).toMatchObject({
            Properties: {
                Timeout: 7,
            },
        });
    });

    it("allows changing the number of retries", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "queues",
            configExt: merge(pluginConfigExt, {
                constructs: {
                    emails: {
                        maxRetries: 1,
                    },
                },
            }),
            command: "package",
        });
        expect(cfTemplate.Resources[computeLogicalId("emails", "Queue")]).toMatchObject({
            Properties: {
                RedrivePolicy: {
                    maxReceiveCount: 1,
                },
            },
        });
    });

    it("allows changing the batch size", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "queues",
            configExt: merge(pluginConfigExt, {
                constructs: {
                    emails: {
                        batchSize: 10,
                    },
                },
            }),
            command: "package",
        });
        expect(cfTemplate.Resources.EmailsWorkerEventSourceMappingSQSEmailsQueueF057328A).toMatchObject({
            Properties: {
                BatchSize: 10,
            },
        });
    });

    it("allows defining a DLQ email alarm", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "queues",
            configExt: merge(pluginConfigExt, {
                constructs: {
                    emails: {
                        alarm: "alerting@example.com",
                    },
                },
            }),
            command: "package",
        });
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            "EmailsWorkerLogGroup",
            "IamRoleLambdaExecution",
            "EmailsWorkerLambdaFunction",
            "EmailsWorkerEventSourceMappingSQSEmailsQueueF057328A",
            "emailsDlq47F8494C",
            "emailsQueueF057328A",
            // Alarm
            "emailsAlarmTopic594BAEC9",
            "emailsAlarmTopicSubscription688AECB6",
            "emailsAlarm1821C14F",
        ]);
        expect(cfTemplate.Resources[computeLogicalId("emails", "Alarm")]).toMatchObject({
            Properties: {
                AlarmActions: [
                    {
                        Ref: computeLogicalId("emails", "AlarmTopic"),
                    },
                ],
                AlarmDescription: "Alert triggered when there are failed jobs in the dead letter queue.",
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                AlarmName: expect.stringMatching(/test-queues-\w+-dev-emails-dlq-alarm/),
                ComparisonOperator: "GreaterThanThreshold",
                Dimensions: [
                    {
                        Name: "QueueName",
                        Value: {
                            "Fn::GetAtt": [computeLogicalId("emails", "Dlq"), "QueueName"],
                        },
                    },
                ],
                EvaluationPeriods: 1,
                MetricName: "ApproximateNumberOfMessagesVisible",
                Namespace: "AWS/SQS",
                Period: 60,
                Statistic: "Sum",
                Threshold: 0,
            },
        });
        expect(cfTemplate.Resources[computeLogicalId("emails", "AlarmTopic")]).toMatchObject({
            Properties: {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                TopicName: expect.stringMatching(/test-queues-\w+-dev-emails-dlq-alarm-topic/),
                DisplayName: "[Alert][emails] There are failed jobs in the dead letter queue.",
            },
        });
        expect(cfTemplate.Resources[computeLogicalId("emails", "AlarmTopicSubscription")]).toMatchObject({
            Properties: {
                Endpoint: "alerting@example.com",
                Protocol: "email",
                TopicArn: {
                    Ref: computeLogicalId("emails", "AlarmTopic"),
                },
            },
        });
    });

    it("should purge messages from the DLQ", async () => {
        const awsMock = mockAws();
        sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("queue-url");
        const purgeSpy = awsMock.mockService("SQS", "purgeQueue");

        await runServerless({
            fixture: "queues",
            configExt: pluginConfigExt,
            command: "emails:failed:purge",
        });

        expect(purgeSpy.firstCall.firstArg).toStrictEqual({
            QueueUrl: "queue-url",
        });
    });

    it("should not do anything if there are no failed messages to retry", async () => {
        const awsMock = mockAws();
        sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("queue-url");
        awsMock.mockService("SQS", "receiveMessage").resolves({
            Messages: [],
        });
        const sendSpy = awsMock.mockService("SQS", "sendMessageBatch");
        const deleteSpy = awsMock.mockService("SQS", "deleteMessageBatch");

        await runServerless({
            fixture: "queues",
            configExt: pluginConfigExt,
            command: "emails:failed:retry",
        });

        expect(sendSpy.callCount).toBe(0);
        expect(deleteSpy.callCount).toBe(0);
    });

    it("should retry messages from the DLQ", async () => {
        const awsMock = mockAws();
        const stackOutputStub = sinon.stub(CloudFormationHelpers, "getStackOutput");
        stackOutputStub.onFirstCall().resolves("queue-url");
        stackOutputStub.onSecondCall().resolves("dlq-url");
        const receiveStub = awsMock.mockService("SQS", "receiveMessage");
        // First call: 1 message is found
        const sqsResponse: ReceiveMessageResult = {
            Messages: [
                {
                    MessageId: "abcd",
                    Body: "sample body",
                    ReceiptHandle: "abcd-handle",
                    Attributes: {},
                    MessageAttributes: {},
                },
            ],
        };
        receiveStub.onFirstCall().resolves(sqsResponse);
        // On next calls: no messages found
        receiveStub.resolves({
            Messages: [],
        });
        const sendResult: SendMessageBatchResult = {
            Successful: [
                {
                    Id: "abcd",
                    MessageId: "abcd",
                    MD5OfMessageBody: "",
                },
            ],
            Failed: [],
        };
        const sendSpy = awsMock.mockService("SQS", "sendMessageBatch").resolves(sendResult);
        const deleteResult: DeleteMessageBatchResult = {
            Successful: [
                {
                    Id: "abcd",
                },
            ],
            Failed: [],
        };
        const deleteSpy = awsMock.mockService("SQS", "deleteMessageBatch").resolves(deleteResult);

        await runServerless({
            fixture: "queues",
            configExt: pluginConfigExt,
            command: "emails:failed:retry",
        });

        // The failed message should have been "sent" to the main queue
        expect(sendSpy.callCount).toBe(1);
        expect(sendSpy.firstCall.firstArg).toStrictEqual({
            QueueUrl: "queue-url",
            Entries: [
                {
                    Id: "abcd",
                    MessageBody: "sample body",
                    MessageAttributes: {},
                },
            ],
        });
        // The failed message should have been "deleted" from the dead letter queue
        expect(deleteSpy.callCount).toBe(1);
        expect(deleteSpy.firstCall.firstArg).toStrictEqual({
            QueueUrl: "dlq-url",
            Entries: [
                {
                    Id: "abcd",
                    ReceiptHandle: "abcd-handle",
                },
            ],
        });
    });

    it("should send a message to the queue", async () => {
        const awsMock = mockAws();
        sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("queue-url");
        const sendSpy = awsMock.mockService("SQS", "sendMessage").resolves();

        await runServerless({
            fixture: "queues",
            configExt: pluginConfigExt,
            command: "emails:send",
            options: {
                body: "Message body",
            },
        });

        expect(sendSpy.callCount).toBe(1);
        expect(sendSpy.firstCall.firstArg).toStrictEqual({
            QueueUrl: "queue-url",
            MessageBody: "Message body",
        });
    });
});
