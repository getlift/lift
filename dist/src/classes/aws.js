var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
__export(exports, {
  awsRequest: () => awsRequest,
  emptyBucket: () => emptyBucket,
  invalidateCloudFrontCache: () => invalidateCloudFrontCache
});
async function awsRequest(params, service, method, provider) {
  return await provider.request(service, method, params);
}
async function emptyBucket(aws, bucketName) {
  const data = await aws.request("S3", "listObjectsV2", {
    Bucket: bucketName
  });
  if (data.Contents === void 0) {
    return;
  }
  const keys = data.Contents.map((item) => item.Key).filter((key) => key !== void 0);
  await aws.request("S3", "deleteObjects", {
    Bucket: bucketName,
    Delete: {
      Objects: keys.map((key) => ({ Key: key }))
    }
  });
}
async function invalidateCloudFrontCache(aws, distributionId) {
  await aws.request("CloudFront", "createInvalidation", {
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: Date.now().toString(),
      Paths: {
        Items: ["/*"],
        Quantity: 1
      }
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  awsRequest,
  emptyBucket,
  invalidateCloudFrontCache
});
//# sourceMappingURL=aws.js.map
