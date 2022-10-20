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
describe("webhooks", () => {
  let cfTemplate;
  let computeLogicalId;
  beforeAll(async () => {
    ({ cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      fixture: "webhooks",
      configExt: import_runServerless.pluginConfigExt,
      command: "package"
    }));
  });
  test.each([
    ["secure", "CUSTOM"],
    ["insecure", "NONE"]
  ])("%p webhook should have authorization type %p", (useCase, expectedAuthorizationType) => {
    expect(cfTemplate.Resources[computeLogicalId(useCase, "Route")]).toMatchObject({
      Properties: {
        AuthorizationType: expectedAuthorizationType
      }
    });
  });
  it("allows overriding webhook properties", () => {
    expect(cfTemplate.Resources[computeLogicalId("extendedWebhook", "Bus")].Properties).toMatchObject({
      Name: "myBus"
    });
    expect(cfTemplate.Resources[computeLogicalId("extendedWebhook", "HttpApi")].Properties).toMatchObject({
      FailOnWarnings: true
    });
  });
});
//# sourceMappingURL=webhooks.test.js.map
