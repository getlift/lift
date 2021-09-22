import type {
    DeleteObjectsOutput,
    DeleteObjectsRequest,
    ListObjectsV2Output,
    ListObjectsV2Request,
    PutObjectOutput,
    PutObjectRequest,
    Object as S3Object,
} from "aws-sdk/clients/s3";
import * as fs from "fs";
import * as util from "util";
import * as path from "path";
import * as crypto from "crypto";
import { lookup } from "mime-types";
import { chunk, flatten } from "lodash";
import type { AwsProvider } from "@lift/providers";
import ServerlessError from "./error";
import { getUtils } from "./logger";

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

type S3Objects = Record<string, S3Object>;

/**
 * Synchronize a local folder to a S3 bucket.
 *
 * @return True if some changes were uploaded.
 */
export async function s3Sync({
    aws,
    localPath,
    targetPathPrefix,
    bucketName,
}: {
    aws: AwsProvider;
    localPath: string;
    targetPathPrefix?: string;
    bucketName: string;
}): Promise<{ hasChanges: boolean; fileChangeCount: number }> {
    let hasChanges = false;
    let fileChangeCount = 0;
    const filesToUpload: string[] = await listFilesRecursively(localPath);
    const existingS3Objects = await s3ListAll(aws, bucketName, targetPathPrefix);

    // Upload files by chunks
    let skippedFiles = 0;
    for (const batch of chunk(filesToUpload, 2)) {
        await Promise.all(
            batch.map(async (file) => {
                const targetKey = targetPathPrefix !== undefined ? path.posix.join(targetPathPrefix, file) : file;
                const fileContent = fs.readFileSync(path.posix.join(localPath, file));

                // Check that the file isn't already uploaded
                if (targetKey in existingS3Objects) {
                    const existingObject = existingS3Objects[targetKey];
                    const etag = computeS3ETag(fileContent);
                    if (etag === existingObject.ETag) {
                        skippedFiles++;

                        return;
                    }
                }

                getUtils().log.verbose(`Uploading ${file}`);
                await s3Put(aws, bucketName, targetKey, fileContent);
                hasChanges = true;
                fileChangeCount++;
            })
        );
    }
    if (skippedFiles > 0) {
        getUtils().log.verbose(`Skipped uploading ${skippedFiles} unchanged files`);
    }

    const targetKeys = filesToUpload.map((file) =>
        targetPathPrefix !== undefined ? path.posix.join(targetPathPrefix, file) : file
    );
    const keysToDelete = findKeysToDelete(Object.keys(existingS3Objects), targetKeys);
    if (keysToDelete.length > 0) {
        keysToDelete.map((key) => {
            getUtils().log.verbose(`Deleting ${key}`);
            fileChangeCount++;
        });
        await s3Delete(aws, bucketName, keysToDelete);
        hasChanges = true;
    }

    return { hasChanges, fileChangeCount };
}

async function listFilesRecursively(directory: string): Promise<string[]> {
    const items = await readdir(directory);

    const files = await Promise.all(
        items.map(async (fileName) => {
            const fullPath = path.posix.join(directory, fileName);
            const fileStat = await stat(fullPath);
            if (fileStat.isFile()) {
                return [fileName];
            } else if (fileStat.isDirectory()) {
                const subFiles = await listFilesRecursively(fullPath);

                return subFiles.map((subFileName) => path.posix.join(fileName, subFileName));
            }

            return [];
        })
    );

    return flatten(files);
}

async function s3ListAll(aws: AwsProvider, bucketName: string, pathPrefix?: string): Promise<S3Objects> {
    let result;
    let continuationToken = undefined;
    const objects: Record<string, S3Object> = {};
    do {
        result = await aws.request<ListObjectsV2Request, ListObjectsV2Output>("S3", "listObjectsV2", {
            Bucket: bucketName,
            Prefix: pathPrefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken,
        });
        (result.Contents ?? []).forEach((object) => {
            if (object.Key === undefined) {
                return;
            }
            objects[object.Key] = object;
        });
        continuationToken = result.NextContinuationToken;
    } while (result.IsTruncated === true);

    return objects;
}

function findKeysToDelete(existing: string[], target: string[]): string[] {
    // Returns every key that shouldn't exist anymore
    return existing.filter((key) => target.indexOf(key) === -1);
}

export async function s3Put(aws: AwsProvider, bucket: string, key: string, fileContent: Buffer): Promise<void> {
    let contentType = lookup(key);
    if (contentType === false) {
        contentType = "application/octet-stream";
    }
    await aws.request<PutObjectRequest, PutObjectOutput>("S3", "putObject", {
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
    });
}

async function s3Delete(aws: AwsProvider, bucket: string, keys: string[]): Promise<void> {
    const response = await aws.request<DeleteObjectsRequest, DeleteObjectsOutput>("S3", "deleteObjects", {
        Bucket: bucket,
        Delete: {
            Objects: keys.map((key) => {
                return {
                    Key: key,
                };
            }),
        },
    });

    // S3 deleteObjects operation will fail silently
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
    if (response.Errors !== undefined && response.Errors.length !== 0) {
        response.Errors.forEach((error) => console.log(error));
        throw new ServerlessError(
            `Unable to delete some files in S3. The "static-website" and "server-side-website" construct require the s3:DeleteObject IAM permissions to synchronize files to S3, is it missing from your deployment policy?`,
            "LIFT_S3_DELETE_OBJECTS_FAILURE"
        );
    }
}

export function computeS3ETag(fileContent: Buffer): string {
    return `"${crypto.createHash("md5").update(fileContent).digest("hex")}"`;
}
