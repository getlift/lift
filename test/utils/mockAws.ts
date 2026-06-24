import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import {
    CopyObjectCommand,
    DeleteObjectsCommand,
    GetObjectTaggingCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    PutObjectTaggingCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import {
    DeleteMessageBatchCommand,
    PurgeQueueCommand,
    ReceiveMessageCommand,
    SendMessageBatchCommand,
    SendMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import * as sinon from "sinon";
import type { SinonStub } from "sinon";

/**
 * Helper to mock the AWS SDK
 */
export function mockAws(): AwsMock {
    const commandStubs: Array<{
        Command: AwsSdkV3CommandConstructor;
        stub: SinonAwsMock;
    }> = [];

    const awsMock = {
        mockService: (service: string, method: string) => {
            const { Client, Command } = getAwsSdkV3Operation(service, method);
            ensureClientStub(Client, commandStubs);
            const stub = sinon.stub<[params: unknown], Promise<unknown>>().resolves();
            commandStubs.push({ Command, stub });

            return stub;
        },
    };

    return awsMock;
}

function ensureClientStub(Client: AwsSdkV3ClientConstructor, commandStubs: CommandStub[]): void {
    if (Client.prototype.send.restore !== undefined) {
        return;
    }

    sinon.stub(Client.prototype, "send").callsFake((command: { input: unknown }) => {
        const commandStub = commandStubs.find(({ Command }) => command instanceof Command);
        if (commandStub === undefined) {
            return Promise.resolve({});
        }

        return commandStub.stub(command.input);
    });
}

function getAwsSdkV3Operation(service: string, method: string): AwsSdkV3Operation {
    const operation = awsSdkV3Operations[`${service}.${method}`];
    if (operation === undefined) {
        throw new Error(`Unsupported test AWS SDK v3 mock ${service}.${method}`);
    }

    return operation;
}

type CommandStub = {
    Command: AwsSdkV3CommandConstructor;
    stub: SinonAwsMock;
};

type AwsMock = ExtendedAwsMock;

type SinonAwsMock = SinonStub<[params: unknown], Promise<unknown>>;

type AwsSdkV3ClientConstructor = {
    prototype: {
        send: {
            (command: { input: unknown }): Promise<unknown>;
            restore?: () => void;
        };
    };
};

type AwsSdkV3CommandConstructor = new (params: unknown) => object;

type AwsSdkV3Operation = {
    Client: AwsSdkV3ClientConstructor;
    Command: AwsSdkV3CommandConstructor;
};

const awsSdkV3Operations: Partial<Record<string, AwsSdkV3Operation>> = {
    "CloudFront.createInvalidation": {
        Client: CloudFrontClient as unknown as AwsSdkV3ClientConstructor,
        Command: CreateInvalidationCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "S3.deleteObjects": {
        Client: S3Client as unknown as AwsSdkV3ClientConstructor,
        Command: DeleteObjectsCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "S3.copyObject": {
        Client: S3Client as unknown as AwsSdkV3ClientConstructor,
        Command: CopyObjectCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "S3.getObjectTagging": {
        Client: S3Client as unknown as AwsSdkV3ClientConstructor,
        Command: GetObjectTaggingCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "S3.listObjectsV2": {
        Client: S3Client as unknown as AwsSdkV3ClientConstructor,
        Command: ListObjectsV2Command as unknown as AwsSdkV3CommandConstructor,
    },
    "S3.putObject": {
        Client: S3Client as unknown as AwsSdkV3ClientConstructor,
        Command: PutObjectCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "S3.putObjectTagging": {
        Client: S3Client as unknown as AwsSdkV3ClientConstructor,
        Command: PutObjectTaggingCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "SQS.deleteMessageBatch": {
        Client: SQSClient as unknown as AwsSdkV3ClientConstructor,
        Command: DeleteMessageBatchCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "SQS.purgeQueue": {
        Client: SQSClient as unknown as AwsSdkV3ClientConstructor,
        Command: PurgeQueueCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "SQS.receiveMessage": {
        Client: SQSClient as unknown as AwsSdkV3ClientConstructor,
        Command: ReceiveMessageCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "SQS.sendMessage": {
        Client: SQSClient as unknown as AwsSdkV3ClientConstructor,
        Command: SendMessageCommand as unknown as AwsSdkV3CommandConstructor,
    },
    "SQS.sendMessageBatch": {
        Client: SQSClient as unknown as AwsSdkV3ClientConstructor,
        Command: SendMessageBatchCommand as unknown as AwsSdkV3CommandConstructor,
    },
};

interface ExtendedAwsMock {
    mockService(service: string, method: string): SinonAwsMock;
}
