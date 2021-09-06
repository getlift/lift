import type {
    DeleteObjectsOutput,
    DeleteObjectsRequest,
    ListObjectsV2Output,
    ListObjectsV2Request,
} from "aws-sdk/clients/s3";
import type { CreateInvalidationRequest, CreateInvalidationResult } from "aws-sdk/clients/cloudfront";
import type { AwsProvider } from "@lift/providers";
import type { Provider as LegacyAwsProvider } from "../types/serverless";

// This is defined as a separate function to allow mocking in tests
export async function awsRequest<Input, Output>(
    params: Input,
    service: string,
    method: string,
    provider: LegacyAwsProvider
): Promise<Output> {
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
