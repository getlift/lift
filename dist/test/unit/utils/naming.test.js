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
var import_naming = __toModule(require("../../../src/utils/naming"));
describe("naming", () => {
  it("should not change names shorter than the limit", () => {
    expect((0, import_naming.ensureNameMaxLength)("foo", 3)).toEqual("foo");
  });
  it("should trim names with a unique suffix to stay under the limit", () => {
    expect((0, import_naming.ensureNameMaxLength)("foobarfoobarfoobarfoobar", 15)).toEqual("foobarfo-7ca709");
    expect((0, import_naming.ensureNameMaxLength)("foobarfoobarfoobarfoobar", 15)).toHaveLength(15);
    expect((0, import_naming.ensureNameMaxLength)("foobarfoofoofoofoofoofoo", 15)).not.toEqual("foobarfo-7ca709");
  });
});
//# sourceMappingURL=naming.test.js.map
