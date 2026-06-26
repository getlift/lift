import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import type { SinonStub } from "sinon";
import { computeS3ETag } from "../../src/utils/s3-sync";
import { mockAws } from "./mockAws";

type VersionedAssetSyncMocks = {
    putObjectSpy: SinonStub<[params: unknown], Promise<unknown>>;
    deleteObjectsSpy: SinonStub<[params: unknown], Promise<unknown>>;
    getObjectTaggingSpy: SinonStub<[params: unknown], Promise<unknown>>;
    putObjectTaggingSpy: SinonStub<[params: unknown], Promise<unknown>>;
    copyObjectSpy: SinonStub<[params: unknown], Promise<unknown>>;
    cloudfrontInvalidationSpy: SinonStub<[params: unknown], Promise<unknown>>;
};

export function mockVersionedAssetSync({
    fixturePath,
    obsoleteKey,
}: {
    fixturePath: string;
    obsoleteKey: string;
}): VersionedAssetSyncMocks {
    const awsMock = mockAws();
    awsMock.mockService("S3", "listObjectsV2").resolves({
        IsTruncated: false,
        Contents: [
            {
                Key: "index.html",
                ETag: computeS3ETag(fs.readFileSync(path.join(fixturePath, "public/index.html"))),
            },
            { Key: "styles.css" },
            { Key: obsoleteKey },
        ],
    });
    awsMock.mockService("S3", "headObject").resolves({
        ContentType: "image/png",
        Metadata: { cache: "forever" },
    });

    return {
        putObjectSpy: awsMock.mockService("S3", "putObject"),
        deleteObjectsSpy: awsMock.mockService("S3", "deleteObjects"),
        getObjectTaggingSpy: awsMock.mockService("S3", "getObjectTagging").callsFake((params) => {
            const key = (params as { Key: string }).Key;
            if (key === "index.html") {
                return Promise.resolve({
                    TagSet: [
                        { Key: "Cache", Value: "forever" },
                        { Key: "Obsolete", Value: "true" },
                    ],
                });
            }
            if (key === obsoleteKey) {
                // The obsolete file carries an unrelated tag that must be preserved by the copy.
                return Promise.resolve({ TagSet: [{ Key: "Cache", Value: "forever" }] });
            }

            return Promise.resolve({ TagSet: [] });
        }),
        putObjectTaggingSpy: awsMock.mockService("S3", "putObjectTagging").resolves({}),
        copyObjectSpy: awsMock.mockService("S3", "copyObject").resolves({}),
        cloudfrontInvalidationSpy: awsMock.mockService("CloudFront", "createInvalidation"),
    };
}

export function expectVersionedAssetSync({
    obsoleteKey,
    mocks,
}: {
    obsoleteKey: string;
    mocks: VersionedAssetSyncMocks;
}): void {
    const {
        putObjectSpy,
        deleteObjectsSpy,
        getObjectTaggingSpy,
        putObjectTaggingSpy,
        copyObjectSpy,
        cloudfrontInvalidationSpy,
    } = mocks;

    sinon.assert.callCount(putObjectSpy, 2);
    sinon.assert.notCalled(deleteObjectsSpy);
    expect(getObjectTaggingSpy.getCalls().map((call) => call.firstArg as unknown)).toEqual(
        expect.arrayContaining([
            {
                Bucket: "bucket-name",
                Key: "index.html",
            },
            {
                Bucket: "bucket-name",
                Key: obsoleteKey,
            },
        ])
    );
    // The Obsolete tag is removed from a current file via PutObjectTagging (restore path).
    expect(putObjectTaggingSpy.getCalls().map((call) => call.firstArg as unknown)).toEqual([
        {
            Bucket: "bucket-name",
            Key: "index.html",
            Tagging: {
                TagSet: [{ Key: "Cache", Value: "forever" }],
            },
        },
    ]);
    // Obsolete files are tagged through an in-place copy (sets the tag and resets the lifecycle expiry).
    sinon.assert.calledOnce(copyObjectSpy);
    expect(copyObjectSpy.firstCall.firstArg).toMatchObject({
        Bucket: "bucket-name",
        Key: obsoleteKey,
        MetadataDirective: "REPLACE",
        Metadata: {
            cache: "forever",
        },
        ContentType: "image/png",
        TaggingDirective: "REPLACE",
        // The pre-existing Cache tag is preserved alongside the added Obsolete tag.
        Tagging: "Cache=forever&Obsolete=true",
    });
    const copyObjectMetadata = (copyObjectSpy.firstCall.firstArg as { Metadata: Record<string, string> }).Metadata;
    expect(typeof copyObjectMetadata["lift-obsolete-at"]).toBe("string");
    sinon.assert.calledOnce(cloudfrontInvalidationSpy);
}
