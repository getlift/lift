import { CreateInvalidationCommand, type CreateInvalidationCommandInput } from "@aws-sdk/client-cloudfront";
import { DeleteObjectsCommand, type DeleteObjectsCommandInput, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { AwsProvider } from "@lift/providers";
import type { AwsSdkV3Config, Provider as LegacyAwsProvider } from "../types/serverless";

export async function getAwsSdkV3Config(provider: LegacyAwsProvider): Promise<AwsSdkV3Config> {
    if (provider.getAwsSdkV3Config) {
        return provider.getAwsSdkV3Config();
    }

    const config: AwsSdkV3Config = {
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

    return config;
}

export async function emptyBucket(aws: AwsProvider, bucketName: string): Promise<void> {
    const data = await (
        await aws.getS3Client()
    ).send(
        new ListObjectsV2Command({
            Bucket: bucketName,
        })
    );
    if (data.Contents === undefined) {
        return;
    }
    const keys = data.Contents.map((item) => item.Key).filter((key): key is string => key !== undefined);
    const params: DeleteObjectsCommandInput = {
        Bucket: bucketName,
        Delete: {
            Objects: keys.map((key) => ({ Key: key })),
        },
    };
    await (await aws.getS3Client()).send(new DeleteObjectsCommand(params));
}

export async function invalidateCloudFrontCache(aws: AwsProvider, distributionId: string): Promise<void> {
    const params: CreateInvalidationCommandInput = {
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
    };
    await (await aws.getCloudFrontClient()).send(new CreateInvalidationCommand(params));
}
