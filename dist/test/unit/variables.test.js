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
var import_runServerlessCli = __toModule(require("../utils/runServerlessCli"));
describe("variables", () => {
  it("should resolve construct variables", async () => {
    const { cfTemplate } = await (0, import_runServerlessCli.runServerlessCli)({
      fixture: "variables",
      command: "package"
    });
    expect(cfTemplate.Resources.FooLambdaFunction).toHaveProperty("Properties.Environment.Variables.VAR1", {
      Ref: "barQueueB989EBF4"
    });
    expect(cfTemplate.Resources.UserDefinedResource).toHaveProperty("Properties.BucketName", {
      Ref: "barQueueB989EBF4"
    });
    expect(cfTemplate.Resources.FooLambdaFunction).toHaveProperty("Properties.Environment.Variables.CUSTOM_VAR", {
      Ref: "bucketBucketF19722A9"
    });
  });
  it("should resolve variables in constructs", async () => {
    const { cfTemplate } = await (0, import_runServerlessCli.runServerlessCli)({
      fixture: "variables",
      command: "package"
    });
    expect(cfTemplate.Resources.BarWorkerLambdaFunction).toHaveProperty("Properties.Environment.Variables", {
      VAR1: "bar",
      CUSTOM_VAR1: "Custom variable 1",
      CUSTOM_VAR2: "Custom variable 2"
    });
    expect(cfTemplate.Resources.barAlarmTopicSubscription56286022).toHaveProperty("Properties.Endpoint", {
      Ref: "bucketBucketF19722A9"
    });
    expect(cfTemplate.Resources.appCDN7AD2C001).toMatchObject({
      Properties: {
        DistributionConfig: {
          Aliases: ["Custom variable 1"],
          ViewerCertificate: {
            AcmCertificateArn: "arn:aws:acm:us-east-1:123466615250:certificate/abcdef-b896-4725-96e3-6f143d06ac0b"
          }
        }
      }
    });
  });
});
//# sourceMappingURL=variables.test.js.map
