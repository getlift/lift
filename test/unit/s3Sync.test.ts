import { S3Client } from "@aws-sdk/client-s3";
import type { AwsProvider } from "@lift/providers";
import * as path from "path";
import * as sinon from "sinon";
import { s3Sync } from "../../src/utils/s3-sync";
import { mockAws } from "../utils/mockAws";

describe("s3 sync", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("can tag obsolete files without reading tags from current files", async () => {
        const awsMock = mockAws();
        const awsProvider = {
            getS3Client: () => Promise.resolve(new S3Client({ region: "us-east-1" })),
        } as AwsProvider;

        awsMock.mockService("S3", "listObjectsV2").resolves({
            IsTruncated: false,
            Contents: [{ Key: "assets/logo.png" }, { Key: "assets/old.png" }],
        });
        const putObjectSpy = awsMock.mockService("S3", "putObject");
        const getObjectTaggingSpy = awsMock.mockService("S3", "getObjectTagging").resolves({ TagSet: [] });
        const putObjectTaggingSpy = awsMock.mockService("S3", "putObjectTagging").resolves({});
        const copyObjectSpy = awsMock.mockService("S3", "copyObject").resolves({});

        const result = await s3Sync({
            aws: awsProvider,
            localPath: path.join(__dirname, "../fixtures/serverSideWebsite/public"),
            targetPathPrefix: "assets",
            bucketName: "bucket-name",
            uploadMode: "none",
            deleteMode: "tag",
            restoreObsoleteTags: false,
        });

        expect(result).toEqual({ hasChanges: true, fileChangeCount: 1 });
        sinon.assert.notCalled(putObjectSpy);
        sinon.assert.calledOnce(getObjectTaggingSpy);
        expect(getObjectTaggingSpy.firstCall.firstArg).toEqual({
            Bucket: "bucket-name",
            Key: "assets/old.png",
        });
        // The Obsolete tag is set via the in-place copy, not a separate PutObjectTagging call.
        sinon.assert.notCalled(putObjectTaggingSpy);
        sinon.assert.calledOnce(copyObjectSpy);
        expect(copyObjectSpy.firstCall.firstArg).toMatchObject({
            Bucket: "bucket-name",
            Key: "assets/old.png",
            TaggingDirective: "REPLACE",
            Tagging: "Obsolete=true",
        });
    });

    it("preserves existing tags (and URL-encodes them) when tagging an obsolete file", async () => {
        const awsMock = mockAws();
        const awsProvider = {
            getS3Client: () => Promise.resolve(new S3Client({ region: "us-east-1" })),
        } as AwsProvider;

        awsMock.mockService("S3", "listObjectsV2").resolves({
            IsTruncated: false,
            Contents: [{ Key: "assets/logo.png" }, { Key: "assets/old.png" }],
        });
        const copyObjectSpy = awsMock.mockService("S3", "copyObject").resolves({});
        // The obsolete file already carries unrelated tags (one needing URL-encoding) plus a stale
        // Obsolete tag that should be dropped before re-adding Obsolete=true.
        awsMock.mockService("S3", "getObjectTagging").resolves({
            TagSet: [
                { Key: "Cache", Value: "forever" },
                { Key: "Team", Value: "a/b c" },
                { Key: "Obsolete", Value: "false" },
            ],
        });

        await s3Sync({
            aws: awsProvider,
            localPath: path.join(__dirname, "../fixtures/serverSideWebsite/public"),
            targetPathPrefix: "assets",
            bucketName: "bucket-name",
            uploadMode: "none",
            deleteMode: "tag",
            restoreObsoleteTags: false,
        });

        sinon.assert.calledOnce(copyObjectSpy);
        expect(copyObjectSpy.firstCall.firstArg).toMatchObject({
            Bucket: "bucket-name",
            Key: "assets/old.png",
            TaggingDirective: "REPLACE",
            Tagging: "Cache=forever&Team=a%2Fb%20c&Obsolete=true",
        });
    });
});
