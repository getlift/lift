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
  getUtils: () => getUtils,
  setUtils: () => setUtils
});
var import_chalk = __toModule(require("chalk"));
let utils;
function createLegacyUtils() {
  const logger = (message) => {
    if (Array.isArray(message)) {
      message = message.join("\n");
    }
    console.log("Lift: " + import_chalk.default.yellow(message));
  };
  logger.debug = (message) => {
    if (process.env.SLS_DEBUG !== void 0) {
      if (Array.isArray(message)) {
        message = message.join("\n");
      }
      console.log(import_chalk.default.gray("Lift: " + (message != null ? message : "")));
    }
  };
  logger.verbose = logger.debug;
  logger.success = logger;
  logger.warning = logger;
  logger.error = logger;
  logger.get = () => logger;
  return {
    writeText: logger,
    log: logger
  };
}
function setUtils(u) {
  utils = u;
}
function getUtils() {
  if (utils === void 0) {
    utils = createLegacyUtils();
  }
  return utils;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getUtils,
  setUtils
});
//# sourceMappingURL=logger.js.map
