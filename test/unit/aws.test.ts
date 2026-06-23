import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    DeleteMessageBatchCommand,
    PurgeQueueCommand,
    ReceiveMessageCommand,
    SendMessageBatchCommand,
    SendMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import * as sinon from "sinon";
import { awsRequest } from "../../src/classes/aws";
import type { Provider as LegacyAwsProvider } from "../../src/types/serverless";

type AwsSdkV3ClientConstructor = {
    prototype: {
        send: (command: object) => Promise<unknown>;
    };
};

type AwsSdkV3CommandConstructor = new (input: object) => object;

describe("awsRequest", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("uses framework AWS SDK v3 config when available", async () => {
        const getAwsSdkV3Config = sinon.stub().resolves({ region: "eu-west-1" });
        const send = sinon.stub(SQSClient.prototype, "send").resolves({ MessageId: "message-id" });
        const provider = {
            getAwsSdkV3Config,
            getCredentials: sinon.stub().throws(new Error("getCredentials should not be called")),
            getRegion: sinon.stub().throws(new Error("getRegion should not be called")),
        } as unknown as LegacyAwsProvider;

        await expect(
            awsRequest({ QueueUrl: "queue-url", MessageBody: "hello" }, "SQS", "sendMessage", provider)
        ).resolves.toEqual({ MessageId: "message-id" });

        expect(getAwsSdkV3Config.calledOnce).toBe(true);
        expect(send.calledOnce).toBe(true);
        expect(send.firstCall.args[0]).toBeInstanceOf(SendMessageCommand);
    });

    it("builds AWS SDK v3 config from legacy framework credentials when needed", async () => {
        const credentials = {
            accessKeyId: "access-key-id",
            secretAccessKey: "secret-access-key",
            sessionToken: "session-token",
            getPromise: sinon.stub().resolves(),
        };
        const send = sinon.stub(SQSClient.prototype, "send").resolves({ MessageId: "message-id" });
        const provider = {
            getCredentials: sinon.stub().returns({ credentials }),
            getRegion: sinon.stub().returns("eu-west-1"),
            isS3TransferAccelerationEnabled: sinon.stub().returns(false),
        } as unknown as LegacyAwsProvider;

        await expect(
            awsRequest({ QueueUrl: "queue-url", MessageBody: "hello" }, "SQS", "sendMessage", provider)
        ).resolves.toEqual({ MessageId: "message-id" });

        expect(credentials.getPromise.calledOnce).toBe(true);
        expect(send.calledOnce).toBe(true);
        expect(send.firstCall.args[0]).toBeInstanceOf(SendMessageCommand);
    });

    it("uses AWS SDK v3 clients and commands for every AWS operation Lift calls", async () => {
        const provider = {
            getAwsSdkV3Config: sinon.stub().resolves({ region: "eu-west-1" }),
            getCredentials: sinon.stub().throws(new Error("getCredentials should not be called")),
        } as unknown as LegacyAwsProvider;
        const operations: {
            service: string;
            method: string;
            params: object;
            client: AwsSdkV3ClientConstructor;
            command: AwsSdkV3CommandConstructor;
        }[] = [
            {
                service: "CloudFormation",
                method: "describeStacks",
                params: { StackName: "stack-name" },
                client: CloudFormationClient as unknown as AwsSdkV3ClientConstructor,
                command: DescribeStacksCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "CloudFront",
                method: "createInvalidation",
                params: { DistributionId: "distribution-id", InvalidationBatch: { CallerReference: "1" } },
                client: CloudFrontClient as unknown as AwsSdkV3ClientConstructor,
                command: CreateInvalidationCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "S3",
                method: "deleteObjects",
                params: { Bucket: "bucket", Delete: { Objects: [{ Key: "file.txt" }] } },
                client: S3Client as unknown as AwsSdkV3ClientConstructor,
                command: DeleteObjectsCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "S3",
                method: "listObjectsV2",
                params: { Bucket: "bucket" },
                client: S3Client as unknown as AwsSdkV3ClientConstructor,
                command: ListObjectsV2Command as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "S3",
                method: "putObject",
                params: { Bucket: "bucket", Key: "file.txt", Body: Buffer.from("hello") },
                client: S3Client as unknown as AwsSdkV3ClientConstructor,
                command: PutObjectCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "SQS",
                method: "deleteMessageBatch",
                params: { QueueUrl: "queue-url", Entries: [{ Id: "id", ReceiptHandle: "receipt-handle" }] },
                client: SQSClient as unknown as AwsSdkV3ClientConstructor,
                command: DeleteMessageBatchCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "SQS",
                method: "purgeQueue",
                params: { QueueUrl: "queue-url" },
                client: SQSClient as unknown as AwsSdkV3ClientConstructor,
                command: PurgeQueueCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "SQS",
                method: "receiveMessage",
                params: { QueueUrl: "queue-url" },
                client: SQSClient as unknown as AwsSdkV3ClientConstructor,
                command: ReceiveMessageCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "SQS",
                method: "sendMessage",
                params: { QueueUrl: "queue-url", MessageBody: "hello" },
                client: SQSClient as unknown as AwsSdkV3ClientConstructor,
                command: SendMessageCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "SQS",
                method: "sendMessageBatch",
                params: { QueueUrl: "queue-url", Entries: [{ Id: "id", MessageBody: "hello" }] },
                client: SQSClient as unknown as AwsSdkV3ClientConstructor,
                command: SendMessageBatchCommand as unknown as AwsSdkV3CommandConstructor,
            },
        ];

        for (const { service, method, params, client, command } of operations) {
            const send = sinon.stub(client.prototype, "send").resolves({ ok: true });

            await expect(awsRequest(params, service, method, provider)).resolves.toEqual({ ok: true });

            expect(send.calledOnce).toBe(true);
            expect(send.firstCall.args[0]).toBeInstanceOf(command);

            send.restore();
        }
    });

    it("fails clearly when an AWS SDK v3 request is not mapped", async () => {
        const provider = {
            getAwsSdkV3Config: sinon.stub().resolves({ region: "eu-west-1" }),
            request: sinon.stub(),
        } as unknown as LegacyAwsProvider;

        await expect(awsRequest({}, "SQS", "unknownMethod", provider)).rejects.toThrow(
            "Unsupported AWS SDK v3 request SQS.unknownMethod"
        );
    });
});
