import {
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
import chalk from "chalk";
import { AwsProvider } from "@lift/providers";

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
    bucketName,
}: {
    aws: AwsProvider;
    localPath: string;
    bucketName: string;
}): Promise<{ hasChanges: boolean }> {
    let hasChanges = false;
    const filesToUpload: string[] = await listFilesRecursively(localPath);
    const existingS3Objects = await s3ListAll(aws, bucketName);

    // Upload files by chunks
    let skippedFiles = 0;
    for (const batch of chunk(filesToUpload, 2)) {
        await Promise.all(
            batch.map(async (file) => {
                const fileContent = fs.readFileSync(path.join(localPath, file));

                // Check that the file isn't already uploaded
                if (file in existingS3Objects) {
                    const existingObject = existingS3Objects[file];
                    const etag = computeS3ETag(fileContent);
                    if (etag === existingObject.ETag) {
                        skippedFiles++;

                        return;
                    }
                }

                console.log(`Uploading ${file}`);
                await s3Put(aws, bucketName, file, fileContent);
                hasChanges = true;
            })
        );
    }
    if (skippedFiles > 0) {
        console.log(chalk.gray(`Skipped uploading ${skippedFiles} unchanged files`));
    }

    const objectsToDelete = findObjectsToDelete(Object.keys(existingS3Objects), filesToUpload);
    if (objectsToDelete.length > 0) {
        objectsToDelete.map((key) => console.log(`Deleting ${key}`));
        await s3Delete(aws, bucketName, objectsToDelete);
        hasChanges = true;
    }

    return { hasChanges };
}

async function listFilesRecursively(directory: string): Promise<string[]> {
    const items = await readdir(directory);

    const files = await Promise.all(
        items.map(async (fileName) => {
            const fullPath = path.join(directory, fileName);
            const fileStat = await stat(fullPath);
            if (fileStat.isFile()) {
                return [fileName];
            } else if (fileStat.isDirectory()) {
                const subFiles = await listFilesRecursively(fullPath);

                return subFiles.map((subFileName) => path.join(fileName, subFileName));
            }

            return [];
        })
    );

    return flatten(files);
}

async function s3ListAll(aws: AwsProvider, bucketName: string): Promise<S3Objects> {
    let result;
    let continuationToken = undefined;
    const objects: Record<string, S3Object> = {};
    do {
        result = await aws.request<ListObjectsV2Request, ListObjectsV2Output>("S3", "listObjectsV2", {
            Bucket: bucketName,
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

function findObjectsToDelete(existing: string[], target: string[]): string[] {
    // Returns every key that shouldn't exist anymore
    return existing.filter((key) => target.indexOf(key) === -1);
}

async function s3Put(aws: AwsProvider, bucket: string, key: string, fileContent: Buffer): Promise<void> {
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
    await aws.request<DeleteObjectsRequest, DeleteObjectsOutput>("S3", "deleteObjects", {
        Bucket: bucket,
        Delete: {
            Objects: keys.map((key) => {
                return {
                    Key: key,
                };
            }),
        },
    });
}

export function computeS3ETag(fileContent: Buffer): string {
    return `"${crypto.createHash("md5").update(fileContent).digest("hex")}"`;
}
