import type {
    CopyObjectOutput,
    CopyObjectRequest,
    GetObjectTaggingOutput,
    GetObjectTaggingRequest,
    HeadObjectOutput,
    HeadObjectRequest,
    ListObjectsV2Output,
    ListObjectsV2Request,
    PutObjectOutput,
    PutObjectRequest,
    PutObjectTaggingOutput,
    PutObjectTaggingRequest,
    Object as S3Object,
} from "aws-sdk/clients/s3";
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

const UPLOAD_BATCH_SIZE = 2;
const TAGGING_BATCH_SIZE = 10;

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
    for (const batch of chunk(filesToUpload, UPLOAD_BATCH_SIZE)) {
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
    const keysToTag = findKeysToDelete(Object.keys(existingS3Objects), targetKeys);
    if (keysToTag.length > 0) {
        const taggedKeys = await s3TagAsObsolete(aws, bucketName, keysToTag);
        taggedKeys.forEach((key) => {
            getUtils().log.verbose(`Tagging obsolete ${key}`);
            fileChangeCount++;
        });
        if (taggedKeys.length > 0) {
            hasChanges = true;
        }
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
    const objects: S3Objects = {};
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
    const targetSet = new Set(target);

    // Returns every key that shouldn't exist anymore.
    return existing.filter((key) => !targetSet.has(key));
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

export async function s3PutIfChanged(
    aws: AwsProvider,
    bucket: string,
    key: string,
    fileContent: Buffer
): Promise<boolean> {
    try {
        const existingObject = await aws.request<HeadObjectRequest, HeadObjectOutput>("S3", "headObject", {
            Bucket: bucket,
            Key: key,
        });
        if (existingObject.ETag === computeS3ETag(fileContent)) {
            return false;
        }
    } catch (error) {
        const code = (error as { code?: string; name?: string }).code ?? (error as { name?: string }).name;
        if (code !== "NotFound" && code !== "NoSuchKey") {
            throw error;
        }
    }

    await s3Put(aws, bucket, key, fileContent);

    return true;
}

async function s3TagAsObsolete(aws: AwsProvider, bucket: string, keys: string[]): Promise<string[]> {
    try {
        const taggedKeys: string[] = [];

        for (const batch of chunk(keys, TAGGING_BATCH_SIZE)) {
            const batchResults = await Promise.all(
                batch.map(async (key) => {
                    const getTagsResponse = await aws.request<GetObjectTaggingRequest, GetObjectTaggingOutput>(
                        "S3",
                        "getObjectTagging",
                        {
                            Bucket: bucket,
                            Key: key,
                        }
                    );
                    const currentTagSet = getTagsResponse.TagSet;
                    if (currentTagSet.some((tag) => tag.Key === "Obsolete" && tag.Value === "true")) {
                        return false;
                    }

                    await aws.request<PutObjectTaggingRequest, PutObjectTaggingOutput>("S3", "putObjectTagging", {
                        Bucket: bucket,
                        Key: key,
                        Tagging: {
                            TagSet: [
                                ...currentTagSet.filter((tag) => tag.Key !== "Obsolete"),
                                {
                                    Key: "Obsolete",
                                    Value: "true",
                                },
                            ],
                        },
                    });

                    // Copy object to refresh LastModified and trigger lifecycle expiry only once.
                    const encodedKey = encodeURIComponent(key).replace(/%2F/g, "/");
                    await aws.request<CopyObjectRequest, CopyObjectOutput>("S3", "copyObject", {
                        Bucket: bucket,
                        Key: key,
                        CopySource: `${bucket}/${encodedKey}`,
                        MetadataDirective: "COPY",
                    });

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
            `Unable to tag some files in S3. The "static-website" and "server-side-website" construct require the s3:GetObjectTagging and s3:PutObjectTagging IAM permissions to synchronize files to S3, is it missing from your deployment policy?`,
            "LIFT_S3_DELETE_OBJECTS_FAILURE"
        );
    }
}

export function computeS3ETag(fileContent: Buffer): string {
    return `"${crypto.createHash("md5").update(fileContent).digest("hex")}"`;
}
