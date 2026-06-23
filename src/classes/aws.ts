import type {
    DeleteObjectsOutput,
    DeleteObjectsRequest,
    ListObjectsV2Output,
    ListObjectsV2Request,
} from "aws-sdk/clients/s3";
import type { CreateInvalidationRequest, CreateInvalidationResult } from "aws-sdk/clients/cloudfront";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PurgeQueueCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { AwsProvider } from "@lift/providers";
import type { Provider as LegacyAwsProvider } from "../types/serverless";

// This is defined as a separate function to allow mocking in tests
export async function awsRequest<Input, Output>(
    params: Input,
    service: string,
    method: string,
    provider: LegacyAwsProvider
): Promise<Output> {
    if (provider.getAwsSdkV3Config) {
        const config = await provider.getAwsSdkV3Config();
        if (service === "CloudFront" && method === "createInvalidation") {
            return (await new CloudFrontClient(config).send(
                new CreateInvalidationCommand(params as ConstructorParameters<typeof CreateInvalidationCommand>[0])
            )) as Output;
        }
        if (service === "S3" && method === "deleteObjects") {
            return (await new S3Client(config).send(
                new DeleteObjectsCommand(params as ConstructorParameters<typeof DeleteObjectsCommand>[0])
            )) as Output;
        }
        if (service === "S3" && method === "listObjectsV2") {
            return (await new S3Client(config).send(
                new ListObjectsV2Command(params as ConstructorParameters<typeof ListObjectsV2Command>[0])
            )) as Output;
        }
        if (service === "SQS" && method === "purgeQueue") {
            return (await new SQSClient(config).send(
                new PurgeQueueCommand(params as ConstructorParameters<typeof PurgeQueueCommand>[0])
            )) as Output;
        }
        if (service === "SQS" && method === "sendMessage") {
            return (await new SQSClient(config).send(
                new SendMessageCommand(params as ConstructorParameters<typeof SendMessageCommand>[0])
            )) as Output;
        }
        throw new Error(`Unsupported AWS SDK v3 request ${service}.${method}`);
    }

    return await provider.request<Input, Output>(service, method, params);
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
