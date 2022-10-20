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
describe("common", () => {
  it("should explicitly require a type for each construct", async () => {
    await expect((0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          avatars: {}
        }
      })
    })).rejects.toThrow(/The construct 'avatars' has no 'type' defined.*/g);
  });
  it("should not override user defined resources in serverless.yml", async () => {
    const { cfTemplate } = await (0, import_runServerless.runServerless)({
      fixture: "common",
      configExt: import_runServerless.pluginConfigExt,
      command: "package"
    });
    expect(cfTemplate.Resources).toMatchObject({
      UserDefinedResource: {}
    });
  });
  it("should validate construct configuration", async () => {
    await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          avatars: {
            type: "storage"
          }
        }
      })
    });
    await expect((0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          avatars: {
            type: "storage",
            foo: "bar"
          }
        }
      })
    })).rejects.toThrow(/Configuration error at 'constructs\.avatars'.*/g);
    await expect((0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          avatars: {
            type: "storage",
            path: "."
          }
        }
      })
    })).rejects.toThrow(/Configuration error at 'constructs\.avatars'.*/g);
  });
});
//# sourceMappingURL=common.test.js.map
