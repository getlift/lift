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
  DatabaseDynamoDBSingleTable: () => import_DatabaseDynamoDBSingleTable.DatabaseDynamoDBSingleTable,
  Queue: () => import_Queue.Queue,
  ServerSideWebsite: () => import_ServerSideWebsite.ServerSideWebsite,
  SinglePageApp: () => import_SinglePageApp.SinglePageApp,
  StaticWebsite: () => import_StaticWebsite.StaticWebsite,
  Storage: () => import_Storage.Storage,
  Vpc: () => import_Vpc.Vpc,
  Webhook: () => import_Webhook.Webhook
});
var import_DatabaseDynamoDBSingleTable = __toModule(require("./DatabaseDynamoDBSingleTable"));
var import_Queue = __toModule(require("./Queue"));
var import_SinglePageApp = __toModule(require("./SinglePageApp"));
var import_StaticWebsite = __toModule(require("./StaticWebsite"));
var import_Storage = __toModule(require("./Storage"));
var import_Vpc = __toModule(require("./Vpc"));
var import_Webhook = __toModule(require("./Webhook"));
var import_ServerSideWebsite = __toModule(require("./ServerSideWebsite"));
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DatabaseDynamoDBSingleTable,
  Queue,
  ServerSideWebsite,
  SinglePageApp,
  StaticWebsite,
  Storage,
  Vpc,
  Webhook
});
//# sourceMappingURL=index.js.map
