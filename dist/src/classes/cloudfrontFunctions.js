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
  redirectToMainDomain: () => redirectToMainDomain
});
var import_error = __toModule(require("../utils/error"));
function redirectToMainDomain(domains) {
  if (domains === void 0 || domains.length < 2) {
    throw new import_error.default(`Invalid value in 'redirectToMainDomain': you must have at least 2 domains configured to enable redirection to the main domain.`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
  }
  const mainDomain = domains[0];
  return `
    if (request.headers["host"].value !== "${mainDomain}") {
        return {
            statusCode: 301,
            statusDescription: "Moved Permanently",
            headers: {
                location: {
                    value: "https://${mainDomain}" + request.uri
                }
            }
        };
    }`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  redirectToMainDomain
});
//# sourceMappingURL=cloudfrontFunctions.js.map
