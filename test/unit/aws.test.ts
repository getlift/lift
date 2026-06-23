import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PurgeQueueCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
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

    it("uses provider.request when the framework exposes the AWS SDK v2 request API", async () => {
        const request = sinon.stub().resolves({ MessageId: "message-id" });
        const provider = {
            request,
        } as unknown as LegacyAwsProvider;

        await expect(
            awsRequest({ QueueUrl: "queue-url", MessageBody: "hello" }, "SQS", "sendMessage", provider)
        ).resolves.toEqual({ MessageId: "message-id" });

        expect(
            request.calledOnceWithExactly("SQS", "sendMessage", { QueueUrl: "queue-url", MessageBody: "hello" })
        ).toBe(true);
    });

    it("uses AWS SDK v3 clients when the framework exposes SDK v3 configuration", async () => {
        const sdkConfig = { region: "eu-west-1" };
        const request = sinon.stub().rejects(new Error("provider.request should not be called"));
        const provider = {
            getAwsSdkV3Config: sinon.stub().resolves(sdkConfig),
            request,
        } as unknown as LegacyAwsProvider;
        const operations: {
            service: string;
            method: string;
            params: object;
            client: AwsSdkV3ClientConstructor;
            command: AwsSdkV3CommandConstructor;
        }[] = [
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
                service: "SQS",
                method: "purgeQueue",
                params: { QueueUrl: "queue-url" },
                client: SQSClient as unknown as AwsSdkV3ClientConstructor,
                command: PurgeQueueCommand as unknown as AwsSdkV3CommandConstructor,
            },
            {
                service: "SQS",
                method: "sendMessage",
                params: { QueueUrl: "queue-url", MessageBody: "hello" },
                client: SQSClient as unknown as AwsSdkV3ClientConstructor,
                command: SendMessageCommand as unknown as AwsSdkV3CommandConstructor,
            },
        ];

        for (const { service, method, params, client, command } of operations) {
            const send = sinon.stub(client.prototype, "send").resolves({ ok: true });

            await expect(awsRequest(params, service, method, provider)).resolves.toEqual({ ok: true });

            expect(send.calledOnce).toBe(true);
            expect(send.firstCall.args[0]).toBeInstanceOf(command);

            send.restore();
        }
        expect(request.notCalled).toBe(true);
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
