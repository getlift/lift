import {
    CopyObjectCommand,
    DeleteObjectsCommand,
    GetObjectTaggingCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import type {
    CopyObjectCommandInput,
    HeadObjectCommandOutput,
    ListObjectsV2CommandOutput,
    PutObjectCommandInput,
    _Object as S3Object,
} from "@aws-sdk/client-s3";
import * as crypto from "crypto";
import * as fs from "fs";
import { chunk, flatten } from "lodash";
import { lookup } from "mime-types";
import * as path from "path";
import type { AwsProvider } from "@lift/providers";
import * as util from "util";
import ServerlessError from "./error";
import { getUtils } from "./logger";

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);

const S3_UPLOAD_CONCURRENCY = 16;

const TAGGING_BATCH_SIZE = 10;

type S3Objects = Record<string, S3Object>;
export type S3SyncDeleteMode = "delete" | "tag" | "none";
export type S3SyncUploadMode = "sync" | "missing" | "none";

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
    uploadMode = "sync",
    deleteMode = "delete",
    restoreObsoleteTags = deleteMode === "tag",
}: {
    aws: AwsProvider;
    localPath: string;
    targetPathPrefix?: string;
    bucketName: string;
    uploadMode?: S3SyncUploadMode;
    deleteMode?: S3SyncDeleteMode;
    restoreObsoleteTags?: boolean;
}): Promise<{ hasChanges: boolean; fileChangeCount: number }> {
    let hasChanges = false;
    let fileChangeCount = 0;
    const filesToUpload: string[] = await listFilesRecursively(localPath);
    const existingS3Objects = await s3ListAll(aws, bucketName, targetPathPrefix);

    let skippedFiles = 0;
    if (uploadMode !== "none") {
        // Upload files by chunks
        for (const batch of chunk(filesToUpload, S3_UPLOAD_CONCURRENCY)) {
            await Promise.all(
                batch.map(async (file) => {
                    const targetKey = targetPathPrefix !== undefined ? path.posix.join(targetPathPrefix, file) : file;

                    if (targetKey in existingS3Objects) {
                        if (uploadMode === "missing") {
                            skippedFiles++;

                            return;
                        }

                        const fileContent = await readFile(path.posix.join(localPath, file));
                        const existingObject = existingS3Objects[targetKey];
                        const etag = computeS3ETag(fileContent);
                        if (etag === existingObject.ETag) {
                            skippedFiles++;
                            if (
                                restoreObsoleteTags &&
                                (await s3RemoveObsoleteTagIfPresent(aws, bucketName, targetKey))
                            ) {
                                getUtils().log.verbose(`${file} was tagged for deletion, removing the tag to keep it`);
                                hasChanges = true;
                                fileChangeCount++;
                            }

                            return;
                        }

                        getUtils().log.verbose(`Uploading ${file}`);
                        await s3Put(aws, bucketName, targetKey, fileContent);
                        hasChanges = true;
                        fileChangeCount++;

                        return;
                    }

                    const fileContent = await readFile(path.posix.join(localPath, file));
                    getUtils().log.verbose(`Uploading ${file}`);
                    await s3Put(aws, bucketName, targetKey, fileContent);
                    hasChanges = true;
                    fileChangeCount++;
                })
            );
        }
        if (skippedFiles > 0) {
            getUtils().log.verbose(`Skipped uploading ${skippedFiles} existing or unchanged files`);
        }
    }

    const targetKeys = filesToUpload.map((file) =>
        targetPathPrefix !== undefined ? path.posix.join(targetPathPrefix, file) : file
    );
    const obsoleteKeys = findKeysToDelete(Object.keys(existingS3Objects), targetKeys);
    if (deleteMode === "delete" && obsoleteKeys.length > 0) {
        const deletedKeys = await s3Delete(aws, bucketName, obsoleteKeys);
        deletedKeys.forEach((key) => {
            getUtils().log.verbose(`Deleting ${key}`);
            fileChangeCount++;
        });
        hasChanges = true;
    }
    if (deleteMode === "tag" && obsoleteKeys.length > 0) {
        const taggedKeys = await s3TagAsObsolete(aws, bucketName, obsoleteKeys);
        taggedKeys.forEach((key) => {
            getUtils().log.verbose(`Tagging ${key} for deletion in 24 hours`);
            fileChangeCount++;
        });
        hasChanges = hasChanges || taggedKeys.length > 0;
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
    let result: ListObjectsV2CommandOutput;
    let continuationToken = undefined;
    const objects: Record<string, S3Object> = {};
    const s3Client = await aws.getS3Client();
    do {
        result = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: pathPrefix,
                MaxKeys: 1000,
                ContinuationToken: continuationToken,
            })
        );
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
    const targetSet = new Set(target);

    // Returns every key that shouldn't exist anymore.
    return existing.filter((key) => !targetSet.has(key));
}

export async function s3Put(aws: AwsProvider, bucket: string, key: string, fileContent: Buffer): Promise<void> {
    let contentType = lookup(key);
    if (contentType === false) {
        contentType = "application/octet-stream";
    }
    const params: PutObjectCommandInput = {
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
    };
    await (await aws.getS3Client()).send(new PutObjectCommand(params));
}

export async function s3PutIfChanged(
    aws: AwsProvider,
    bucket: string,
    key: string,
    fileContent: Buffer,
    options: { removeObsoleteTag?: boolean } = {}
): Promise<boolean> {
    try {
        const existingObject: HeadObjectCommandOutput = await (
            await aws.getS3Client()
        ).send(
            new HeadObjectCommand({
                Bucket: bucket,
                Key: key,
            })
        );
        if (existingObject.ETag === computeS3ETag(fileContent)) {
            if (options.removeObsoleteTag === true) {
                return s3RemoveObsoleteTagIfPresent(aws, bucket, key);
            }

            return false;
        }
    } catch (error) {
        if (!isMissingObjectError(error)) {
            throw error;
        }
    }

    await s3Put(aws, bucket, key, fileContent);

    return true;
}

export async function s3PutIfMissing(
    aws: AwsProvider,
    bucket: string,
    key: string,
    fileContent: Buffer
): Promise<boolean> {
    try {
        await (
            await aws.getS3Client()
        ).send(
            new HeadObjectCommand({
                Bucket: bucket,
                Key: key,
            })
        );

        return false;
    } catch (error) {
        if (!isMissingObjectError(error)) {
            throw error;
        }
    }

    await s3Put(aws, bucket, key, fileContent);

    return true;
}

function isMissingObjectError(error: unknown): boolean {
    const code = (error as { code?: string; name?: string }).code ?? (error as { name?: string }).name;

    return code === "NotFound" || code === "NoSuchKey";
}

async function s3Delete(aws: AwsProvider, bucket: string, keys: string[]): Promise<string[]> {
    const deletedKeys: string[] = [];
    const batches = chunk(keys, 1000);

    await Promise.all(
        batches.map(async (keysToDeleteChunk) => {
            getUtils().log.verbose(`Deleting ${keysToDeleteChunk.length} obsolete assets`);

            const response = await (
                await aws.getS3Client()
            ).send(
                new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: {
                        Objects: keysToDeleteChunk.map((key) => {
                            return {
                                Key: key,
                            };
                        }),
                    },
                })
            );

            keysToDeleteChunk.forEach((key) => deletedKeys.push(key));

            // S3 deleteObjects operation will fail silently
            // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
            if (response.Errors !== undefined && response.Errors.length !== 0) {
                response.Errors.forEach((error) => console.log(error));
                throw new ServerlessError(
                    `Unable to delete some files in S3. The "static-website" and "server-side-website" construct require the s3:DeleteObject IAM permissions to synchronize files to S3, is it missing from your deployment policy?`,
                    "LIFT_S3_DELETE_OBJECTS_FAILURE"
                );
            }
        })
    );

    return deletedKeys;
}

async function s3RemoveObsoleteTagIfPresent(aws: AwsProvider, bucket: string, key: string): Promise<boolean> {
    const s3Client = await aws.getS3Client();
    const getTagsResponse = await s3Client.send(
        new GetObjectTaggingCommand({
            Bucket: bucket,
            Key: key,
        })
    );
    const currentTagSet = getTagsResponse.TagSet ?? [];
    if (!currentTagSet.some((tag) => tag.Key === "Obsolete" && tag.Value === "true")) {
        return false;
    }

    await s3Client.send(
        new PutObjectTaggingCommand({
            Bucket: bucket,
            Key: key,
            Tagging: {
                TagSet: currentTagSet.filter((tag) => tag.Key !== "Obsolete"),
            },
        })
    );

    return true;
}

async function s3TagAsObsolete(aws: AwsProvider, bucket: string, keys: string[]): Promise<string[]> {
    try {
        const taggedKeys: string[] = [];
        const s3Client = await aws.getS3Client();

        for (const batch of chunk(keys, TAGGING_BATCH_SIZE)) {
            const batchResults = await Promise.all(
                batch.map(async (key) => {
                    const getTagsResponse = await s3Client.send(
                        new GetObjectTaggingCommand({
                            Bucket: bucket,
                            Key: key,
                        })
                    );
                    const currentTagSet = getTagsResponse.TagSet ?? [];
                    if (currentTagSet.some((tag) => tag.Key === "Obsolete" && tag.Value === "true")) {
                        return false;
                    }

                    const existingObject = await s3Client.send(
                        new HeadObjectCommand({
                            Bucket: bucket,
                            Key: key,
                        })
                    );
                    // Copy the object onto itself to refresh LastModified (so the lifecycle expiry
                    // counts from now) and set the Obsolete tag in the same call. S3 rejects
                    // self-copies that only change tags, so we preserve the existing metadata and add
                    // a Lift-owned marker to make this a valid metadata update.
                    const tagging = [
                        ...currentTagSet.filter((tag) => tag.Key !== "Obsolete"),
                        { Key: "Obsolete", Value: "true" },
                    ]
                        .map((tag) => `${encodeURIComponent(tag.Key ?? "")}=${encodeURIComponent(tag.Value ?? "")}`)
                        .join("&");
                    const encodedKey = encodeURIComponent(key).replace(/%2F/g, "/");
                    await s3Client.send(
                        new CopyObjectCommand(copyObjectParams(bucket, key, encodedKey, tagging, existingObject))
                    );

                    return true;
                })
            );

            batch.forEach((key, index) => {
                if (batchResults[index]) {
                    taggedKeys.push(key);
                }
            });
        }

        return taggedKeys;
    } catch (error) {
        console.log(error);
        throw new ServerlessError(
            `Unable to tag some files in S3. The "static-website" and "server-side-website" constructs require the s3:GetObjectTagging, s3:PutObjectTagging, s3:GetObject and s3:PutObject (the obsolete files are copied in place to reset their lifecycle expiry) IAM permissions to synchronize files to S3, is it missing from your deployment policy?`,
            "LIFT_S3_TAG_OBJECTS_FAILURE"
        );
    }
}

function copyObjectParams(
    bucket: string,
    key: string,
    encodedKey: string,
    tagging: string,
    existingObject: HeadObjectCommandOutput
): CopyObjectCommandInput {
    return {
        Bucket: bucket,
        Key: key,
        CopySource: `${bucket}/${encodedKey}`,
        MetadataDirective: "REPLACE",
        Metadata: {
            ...existingObject.Metadata,
            "lift-obsolete-at": new Date().toISOString(),
        },
        TaggingDirective: "REPLACE",
        Tagging: tagging,
        CacheControl: existingObject.CacheControl,
        ContentDisposition: existingObject.ContentDisposition,
        ContentEncoding: existingObject.ContentEncoding,
        ContentLanguage: existingObject.ContentLanguage,
        ContentType: existingObject.ContentType,
        Expires: existingObject.Expires,
        WebsiteRedirectLocation: existingObject.WebsiteRedirectLocation,
    };
}

export function computeS3ETag(fileContent: Buffer): string {
    return `"${crypto.createHash("md5").update(fileContent).digest("hex")}"`;
}
