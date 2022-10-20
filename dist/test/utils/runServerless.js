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
  baseConfig: () => baseConfig,
  pluginConfigExt: () => pluginConfigExt,
  runServerless: () => runServerless
});
var import_path = __toModule(require("path"));
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_setup_run_serverless_fixtures_engine = __toModule(require("@serverless/test/setup-run-serverless-fixtures-engine"));
const computeLogicalId = (serverless, ...address) => {
  const initialNode = serverless.stack.node;
  const foundNode = [...address].reduce((currentNode, nextNodeId) => {
    const nextNode = currentNode.tryFindChild(nextNodeId);
    if (!nextNode) {
      const existingNodes = currentNode.children.map((child) => child.node.id).join(", ");
      throw new Error(`No node named ${nextNodeId} found in ${address.join(".")} address. Existing nodes: ${existingNodes}`);
    }
    return nextNode.node;
  }, initialNode);
  const resourceNode = foundNode.tryFindChild("Resource");
  if (resourceNode) {
    return import_aws_cdk_lib.Names.nodeUniqueId(resourceNode.node);
  }
  return import_aws_cdk_lib.Names.nodeUniqueId(foundNode);
};
const runServerless = async (options) => {
  const runServerlessReturnValues = await (0, import_setup_run_serverless_fixtures_engine.default)({
    fixturesDir: import_path.default.resolve(__dirname, "../fixtures"),
    serverlessDir: import_path.default.resolve(__dirname, "../../node_modules/serverless")
  })(options);
  return {
    ...runServerlessReturnValues,
    computeLogicalId: (...address) => computeLogicalId(runServerlessReturnValues.serverless, ...address)
  };
};
const pluginConfigExt = {
  plugins: [import_path.default.join(process.cwd(), "src/plugin.ts")]
};
const baseConfig = {
  service: "app",
  provider: {
    name: "aws"
  },
  plugins: [import_path.default.join(process.cwd(), "src/plugin.ts")]
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  baseConfig,
  pluginConfigExt,
  runServerless
});
//# sourceMappingURL=runServerless.js.map
