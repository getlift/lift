var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
__export(exports, {
  AwsConstruct: () => AwsConstruct
});
var import_constructs = __toModule(require("constructs"));
var import_lodash = __toModule(require("lodash"));
var import_traverse = __toModule(require("traverse"));
var import_error = __toModule(require("../../utils/error"));
class AwsConstruct extends import_constructs.Construct {
  applyExtensions(extensions) {
    const availableExtensions = this.extend();
    if ((0, import_lodash.isEmpty)(extensions) || (0, import_lodash.isEmpty)(availableExtensions)) {
      return;
    }
    Object.entries(extensions).forEach(([extensionKey, extensionObject]) => {
      if (!Object.keys(availableExtensions).includes(extensionKey)) {
        throw new import_error.default(`There is no extension '${extensionKey}' available on this construct. Available extensions are: ${Object.keys(availableExtensions).join(", ")}.`, "LIFT_UNKNOWN_EXTENSION");
      }
      if ((0, import_lodash.isObject)(extensionObject)) {
        const accumulatedPathsPointingToArray = [];
        (0, import_traverse.paths)(extensionObject).filter((path) => !(0, import_lodash.isEmpty)(path)).map((path) => {
          return path.join(".");
        }).filter((path) => {
          if (accumulatedPathsPointingToArray.some((previouslySelectedPath) => path.startsWith(previouslySelectedPath))) {
            return false;
          }
          const pointedValue = (0, import_lodash.get)(extensionObject, path);
          const isPathPointingToArray = (0, import_lodash.isArray)(pointedValue);
          if (isPathPointingToArray) {
            accumulatedPathsPointingToArray.push(path);
            return true;
          }
          const isPathPointingToLeaf = !(0, import_lodash.isObject)(pointedValue);
          return isPathPointingToLeaf;
        }).map((path) => {
          availableExtensions[extensionKey].addOverride(path, (0, import_lodash.get)(extensionObject, path));
        });
      }
    });
  }
  static create(provider, id, configuration) {
    var _a;
    const construct = new this(provider.stack, id, configuration, provider);
    construct.applyExtensions((_a = configuration.extensions) != null ? _a : {});
    return construct;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AwsConstruct
});
//# sourceMappingURL=AwsConstruct.js.map
