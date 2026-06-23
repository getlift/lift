import type {
    DeleteObjectsOutput,
    DeleteObjectsRequest,
    ListObjectsV2Output,
    ListObjectsV2Request,
} from "aws-sdk/clients/s3";
import type { CreateInvalidationRequest, CreateInvalidationResult } from "aws-sdk/clients/cloudfront";
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import * as CloudFormationCommands from "@aws-sdk/client-cloudformation";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import * as CloudFrontCommands from "@aws-sdk/client-cloudfront";
import { S3Client } from "@aws-sdk/client-s3";
import * as S3Commands from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import * as SQSCommands from "@aws-sdk/client-sqs";
import type { AwsProvider } from "@lift/providers";
import type { Provider as LegacyAwsProvider } from "../types/serverless";

type AwsSdkV3Client = {
    send(command: object): Promise<unknown>;
};
type AwsSdkV3ClientConstructor = new (config: Record<string, unknown>) => AwsSdkV3Client;
type AwsSdkV3CommandConstructor = new (params: unknown) => object;
type AwsSdkV3Service = {
    Client: AwsSdkV3ClientConstructor;
    commands: Record<string, unknown>;
};

const awsSdkV3Services: Partial<Record<string, AwsSdkV3Service>> = {
    CloudFormation: {
        Client: CloudFormationClient,
        commands: CloudFormationCommands,
    },
    CloudFront: {
        Client: CloudFrontClient,
        commands: CloudFrontCommands,
    },
    S3: {
        Client: S3Client,
        commands: S3Commands,
    },
    SQS: {
        Client: SQSClient,
        commands: SQSCommands,
    },
};

// This is defined as a separate function to allow mocking in tests
export async function awsRequest<Input, Output>(
    params: Input,
    service: string,
    method: string,
    provider: LegacyAwsProvider
): Promise<Output> {
    const sdkService = awsSdkV3Services[service];
    if (sdkService === undefined) {
        throw new Error(`Unsupported AWS SDK v3 service ${service}`);
    }

    const Command = sdkService.commands[`${method.charAt(0).toUpperCase()}${method.slice(1)}Command`] as
        | AwsSdkV3CommandConstructor
        | undefined;
    if (Command === undefined) {
        throw new Error(`Unsupported AWS SDK v3 request ${service}.${method}`);
    }

    const client = new sdkService.Client(await getAwsSdkV3Config(provider, service));

    return (await client.send(new Command(params))) as Output;
}

async function getAwsSdkV3Config(provider: LegacyAwsProvider, service: string): Promise<Record<string, unknown>> {
    if (provider.getAwsSdkV3Config) {
        return provider.getAwsSdkV3Config();
    }

    const config: Record<string, unknown> = {
        region: provider.getRegion(),
    };
    const credentialsConfig = provider.getCredentials ? provider.getCredentials() : {};
    const credentials = credentialsConfig.credentials ?? credentialsConfig;
    if (credentials.getPromise) {
        await credentials.getPromise();
    }
    if (credentials.accessKeyId !== undefined && credentials.secretAccessKey !== undefined) {
        config.credentials = {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
        };
    }
    if (service === "S3" && provider.isS3TransferAccelerationEnabled) {
        config.useAccelerateEndpoint = provider.isS3TransferAccelerationEnabled();
    }

    return config;
}

export async function emptyBucket(aws: AwsProvider, bucketName: string): Promise<void> {
    const data = await aws.request<ListObjectsV2Request, ListObjectsV2Output>("S3", "listObjectsV2", {
        Bucket: bucketName,
    });
    if (data.Contents === undefined) {
        return;
    }
    const keys = data.Contents.map((item) => item.Key).filter((key): key is string => key !== undefined);
    await aws.request<DeleteObjectsRequest, DeleteObjectsOutput>("S3", "deleteObjects", {
        Bucket: bucketName,
        Delete: {
            Objects: keys.map((key) => ({ Key: key })),
        },
    });
}

export async function invalidateCloudFrontCache(aws: AwsProvider, distributionId: string): Promise<void> {
    await aws.request<CreateInvalidationRequest, CreateInvalidationResult>("CloudFront", "createInvalidation", {
        DistributionId: distributionId,
        InvalidationBatch: {
            // This should be a unique ID: we use a timestamp
            CallerReference: Date.now().toString(),
            Paths: {
                // Invalidate everything
                Items: ["/*"],
                Quantity: 1,
            },
        },
    });
}
