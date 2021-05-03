import { merge } from "lodash";
import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("queues", () => {
    it("should create all required resources", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "queues",
            configExt: pluginConfigExt,
            cliArgs: ["package"],
        });
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            // Lambda worker
            "EmailsWorkerLogGroup",
            "IamRoleLambdaExecution",
            "EmailsWorkerLambdaFunction",
            // Lambda subscription to SQS
            "EmailsWorkerEventSourceMappingSQSQueuesemailsQueueCEEDDDDE",
            // Queues
            "queuesemailsDlq7ACDC28D",
            "queuesemailsQueueCEEDDDDE",
        ]);
        expect(cfTemplate.Resources[computeLogicalId("queues", "emails", "Queue")]).toMatchObject({
            DeletionPolicy: "Delete",
            Properties: {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                QueueName: expect.stringMatching(/test-queues-\w+-dev-emails/),
                RedrivePolicy: {
                    deadLetterTargetArn: {
                        "Fn::GetAtt": ["queuesemailsDlq7ACDC28D", "Arn"],
                    },
                    maxReceiveCount: 3,
                },
                VisibilityTimeout: 36,
            },
            Type: "AWS::SQS::Queue",
            UpdateReplacePolicy: "Delete",
        });
        expect(cfTemplate.Resources[computeLogicalId("queues", "emails", "Dlq")]).toMatchObject({
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
        expect(cfTemplate.Resources.EmailsWorkerEventSourceMappingSQSQueuesemailsQueueCEEDDDDE).toEqual({
            DependsOn: ["IamRoleLambdaExecution"],
            Properties: {
                BatchSize: 1,
                Enabled: true,
                EventSourceArn: {
                    "Fn::GetAtt": ["queuesemailsQueueCEEDDDDE", "Arn"],
                },
                FunctionName: {
                    "Fn::GetAtt": ["EmailsWorkerLambdaFunction", "Arn"],
                },
                MaximumBatchingWindowInSeconds: 60,
            },
            Type: "AWS::Lambda::EventSourceMapping",
        });
        expect(cfTemplate.Outputs).toMatchObject({
            queuesemailsQueueName8E6EF14C: {
                Description: 'Name of the "emails" SQS queue.',
                Value: {
                    "Fn::GetAtt": ["queuesemailsQueueCEEDDDDE", "QueueName"],
                },
            },
            queuesemailsQueueUrlF73A22D6: {
                Description: 'URL of the "emails" SQS queue.',
                Value: {
                    Ref: "queuesemailsQueueCEEDDDDE",
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
                                            "Fn::GetAtt": ["queuesemailsQueueCEEDDDDE", "Arn"],
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
                queues: {
                    emails: {
                        worker: {
                            timeout: 7,
                        },
                    },
                },
            }),
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources[computeLogicalId("queues", "emails", "Queue")]).toMatchObject({
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
                queues: {
                    emails: {
                        maxRetries: 1,
                    },
                },
            }),
            cliArgs: ["package"],
        });
        expect(cfTemplate.Resources[computeLogicalId("queues", "emails", "Queue")]).toMatchObject({
            Properties: {
                RedrivePolicy: {
                    maxReceiveCount: 1,
                },
            },
        });
    });

    it("allows defining a DLQ email alarm", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "queues",
            configExt: merge(pluginConfigExt, {
                queues: {
                    emails: {
                        alarm: "alerting@example.com",
                    },
                },
            }),
            cliArgs: ["package"],
        });
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            "EmailsWorkerLogGroup",
            "IamRoleLambdaExecution",
            "EmailsWorkerLambdaFunction",
            "EmailsWorkerEventSourceMappingSQSQueuesemailsQueueCEEDDDDE",
            "queuesemailsDlq7ACDC28D",
            "queuesemailsQueueCEEDDDDE",
            // Alarm
            "queuesemailsAlarmTopic4EC198A9",
            "queuesemailsAlarmTopicSubscription9A3D35C5",
            "queuesemailsAlarm0E7F75C1",
        ]);
        expect(cfTemplate.Resources[computeLogicalId("queues", "emails", "Alarm")]).toMatchObject({
            Properties: {
                AlarmActions: [
                    {
                        Ref: "queuesemailsAlarmTopic4EC198A9",
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
                            "Fn::GetAtt": ["queuesemailsDlq7ACDC28D", "QueueName"],
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
        expect(cfTemplate.Resources[computeLogicalId("queues", "emails", "AlarmTopic")]).toMatchObject({
            Properties: {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                TopicName: expect.stringMatching(/test-queues-\w+-dev-emails-dlq-alarm-topic/),
                DisplayName: "[Alert][emails] There are failed jobs in the dead letter queue.",
            },
        });
        expect(cfTemplate.Resources[computeLogicalId("queues", "emails", "AlarmTopicSubscription")]).toMatchObject({
            Properties: {
                Endpoint: "alerting@example.com",
                Protocol: "email",
                TopicArn: {
                    Ref: "queuesemailsAlarmTopic4EC198A9",
                },
            },
        });
    });
});
