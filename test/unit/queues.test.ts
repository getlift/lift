import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("queues", () => {
    it("should create all required resources", async () => {
        const { cfTemplate } = await runServerless({
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
            "EmailsWorkerEventSourceMappingSQSEmailsQueue",
            // Queues
            "EmailsDlq3A50F0E0",
            "EmailsQueue3086DFE6",
        ]);
        expect(cfTemplate.Resources.EmailsQueue3086DFE6).toMatchObject({
            DeletionPolicy: "Delete",
            Properties: {
                MessageRetentionPeriod: 60,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                QueueName: expect.stringMatching(/test-queues-\w+-dev-emails/),
                RedrivePolicy: {
                    deadLetterTargetArn: {
                        "Fn::GetAtt": ["EmailsDlq3A50F0E0", "Arn"],
                    },
                    maxReceiveCount: 3,
                },
                VisibilityTimeout: 10,
            },
            Type: "AWS::SQS::Queue",
            UpdateReplacePolicy: "Delete",
        });
        expect(cfTemplate.Resources.EmailsDlq3A50F0E0).toMatchObject({
            DeletionPolicy: "Delete",
            Properties: {
                MessageRetentionPeriod: 1209600,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                QueueName: expect.stringMatching(
                    /test-queues-\w+-dev-emails-dlq/
                ),
            },
            Type: "AWS::SQS::Queue",
            UpdateReplacePolicy: "Delete",
        });
        expect(cfTemplate.Resources.EmailsWorkerLambdaFunction).toMatchObject({
            DependsOn: ["EmailsWorkerLogGroup"],
            Properties: {
                Code: {
                    S3Bucket: {
                        Ref: "ServerlessDeploymentBucket",
                    },
                },
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                FunctionName: expect.stringMatching(
                    /test-queues-\w+-dev-emailsWorker/
                ),
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
        expect(
            cfTemplate.Resources.EmailsWorkerEventSourceMappingSQSEmailsQueue
        ).toEqual({
            DependsOn: ["IamRoleLambdaExecution"],
            Properties: {
                BatchSize: 1,
                Enabled: true,
                EventSourceArn: {
                    "Fn::GetAtt": ["EmailsQueue", "Arn"],
                },
                FunctionName: {
                    "Fn::GetAtt": ["EmailsWorkerLambdaFunction", "Arn"],
                },
                MaximumBatchingWindowInSeconds: 60,
            },
            Type: "AWS::Lambda::EventSourceMapping",
        });
        expect(cfTemplate.Outputs).toMatchObject({
            EmailsQueueName: {
                Description: 'Name of the "emails" SQS queue.',
                Value: {
                    "Fn::GetAtt": ["EmailsQueue3086DFE6", "QueueName"],
                },
            },
            EmailsQueueUrl: {
                Description: 'URL of the "emails" SQS queue.',
                Value: {
                    Ref: "EmailsQueue3086DFE6",
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
                                            "Fn::GetAtt": [
                                                "EmailsQueue",
                                                "Arn",
                                            ],
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
});
