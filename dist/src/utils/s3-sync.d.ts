/// <reference types="node" />
import type { AwsProvider } from "@lift/providers";
/**
 * Synchronize a local folder to a S3 bucket.
 *
 * @return True if some changes were uploaded.
 */
export declare function s3Sync({ aws, localPath, targetPathPrefix, bucketName, }: {
    aws: AwsProvider;
    localPath: string;
    targetPathPrefix?: string;
    bucketName: string;
}): Promise<{
    hasChanges: boolean;
    fileChangeCount: number;
}>;
export declare function s3Put(aws: AwsProvider, bucket: string, key: string, fileContent: Buffer): Promise<void>;
export declare function computeS3ETag(fileContent: Buffer): string;
