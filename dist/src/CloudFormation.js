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
  PolicyStatement: () => PolicyStatement,
  getStackOutput: () => getStackOutput
});
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_logger = __toModule(require("./utils/logger"));
async function getStackOutput(aws, output) {
  const outputId = import_aws_cdk_lib.Stack.of(output.stack).resolve(output.logicalId);
  const stackName = aws.stackName;
  (0, import_logger.getUtils)().log.debug(`Fetching output "${outputId}" in stack "${stackName}"`);
  let data;
  try {
    data = await aws.request("CloudFormation", "describeStacks", {
      StackName: stackName
    });
  } catch (e) {
    if (e instanceof Error && e.message === `Stack with id ${stackName} does not exist`) {
      (0, import_logger.getUtils)().log.debug(e.message);
      return void 0;
    }
    throw e;
  }
  if (!data.Stacks || !data.Stacks[0].Outputs) {
    return void 0;
  }
  for (const item of data.Stacks[0].Outputs) {
    if (item.OutputKey === outputId) {
      return item.OutputValue;
    }
  }
  return void 0;
}
class PolicyStatement {
  constructor(Action, Resource) {
    this.Effect = "Allow";
    this.Action = Action;
    this.Resource = Resource;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PolicyStatement,
  getStackOutput
});
//# sourceMappingURL=CloudFormation.js.map
