var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __reExport = (target, module2, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && key !== "default")
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toModule = (module2) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", module2 && module2.__esModule && "default" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
};
var import_runServerless = __toModule(require("../utils/runServerless"));
describe("storage", () => {
  let cfTemplate;
  let computeLogicalId;
  beforeAll(async () => {
    ({ cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      fixture: "storage",
      configExt: import_runServerless.pluginConfigExt,
      command: "package"
    }));
  });
  describe("common tests", () => {
    const useCases = [["default"], ["kmsEncryption"]];
    test.each(useCases)("%p - should configure a lifecycle policy", (useCase) => {
      expect(cfTemplate.Resources[computeLogicalId(useCase, "Bucket")].Properties.LifecycleConfiguration).toMatchObject({
        Rules: [
          {
            Status: "Enabled",
            Transitions: [
              {
                StorageClass: "INTELLIGENT_TIERING",
                TransitionInDays: 0
              }
            ]
          },
          {
            NoncurrentVersionExpiration: {
              NoncurrentDays: 30
            },
            Status: "Enabled"
          }
        ]
      });
    });
    test.each(useCases)("%p - should have versionning enabled", (useCase) => {
      expect(cfTemplate.Resources[computeLogicalId(useCase, "Bucket")].Properties.VersioningConfiguration).toStrictEqual({ Status: "Enabled" });
    });
  });
  test.each([
    ["default", "AES256"],
    ["kmsEncryption", "aws:kms"]
  ])("should allow %p encryption", (construct, expectedSSEAlgorithm) => {
    expect(cfTemplate.Resources[computeLogicalId(construct, "Bucket")].Properties).toMatchObject({
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: { SSEAlgorithm: expectedSSEAlgorithm }
          }
        ]
      }
    });
  });
  it("allows overriding bucket properties", () => {
    expect(cfTemplate.Resources[computeLogicalId("extendedBucket", "Bucket")].Properties).toMatchObject({
      ObjectLockEnabled: true
    });
  });
  it("allows overriding bucket properties with array", () => {
    expect(cfTemplate.Resources[computeLogicalId("extendedBucketWithArray", "Bucket")].Properties).toMatchObject({
      CorsConfiguration: {
        CorsRules: [
          {
            AllowedOrigins: ["*"],
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "HEAD", "PUT", "POST"]
          }
        ]
      }
    });
  });
});
//# sourceMappingURL=storage.test.js.map
