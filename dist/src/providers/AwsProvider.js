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
  AwsProvider: () => AwsProvider
});
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_lodash = __toModule(require("lodash"));
var import_aws = __toModule(require("@lift/constructs/aws"));
var import_CloudFormation = __toModule(require("../CloudFormation"));
var import_aws2 = __toModule(require("../classes/aws"));
var import_error = __toModule(require("../utils/error"));
const AWS_DEFINITION = {
  type: "object",
  properties: {},
  additionalProperties: false
};
const _AwsProvider = class {
  constructor(serverless) {
    this.serverless = serverless;
    this.stackName = serverless.getProvider("aws").naming.getStackName();
    this.app = new import_aws_cdk_lib.App();
    this.stack = new import_aws_cdk_lib.Stack(this.app, void 0, {
      synthesizer: new import_aws_cdk_lib.DefaultStackSynthesizer({
        generateBootstrapVersionRule: false
      })
    });
    this.legacyProvider = serverless.getProvider("aws");
    this.naming = this.legacyProvider.naming;
    this.region = serverless.getProvider("aws").getRegion();
    serverless.stack = this.stack;
  }
  static registerConstructs(...constructClasses) {
    for (const constructClass of constructClasses) {
      if (constructClass.type in this.constructClasses) {
        throw new import_error.default(`The construct type '${constructClass.type}' was registered twice`, "LIFT_CONSTRUCT_TYPE_CONFLICT");
      }
      this.constructClasses[constructClass.type] = constructClass;
    }
  }
  static getConstructClass(type) {
    return this.constructClasses[type];
  }
  static getAllConstructClasses() {
    return Object.values(this.constructClasses);
  }
  static create(serverless) {
    return new this(serverless);
  }
  createConstruct(type, id) {
    const Construct = _AwsProvider.getConstructClass(type);
    if (Construct === void 0) {
      throw new import_error.default(`The construct '${id}' has an unknown type '${type}'
Find all construct types available here: https://github.com/getlift/lift#constructs`, "LIFT_UNKNOWN_CONSTRUCT_TYPE");
    }
    const configuration = (0, import_lodash.get)(this.serverless.configurationInput.constructs, id, {});
    return Construct.create(this, id, configuration);
  }
  addFunction(functionName, functionConfig) {
    if (!this.serverless.configurationInput.functions) {
      this.serverless.configurationInput.functions = {};
    }
    (0, import_lodash.merge)(this.serverless.service.functions, {
      [functionName]: functionConfig
    });
    this.serverless.service.setFunctionNames(this.serverless.processedInput.options);
  }
  setVpcConfig(securityGroups, subnets) {
    if (this.getVpcConfig() !== null) {
      throw new import_error.default(`Can't register more than one VPC.
Either you have several "vpc" constructs 
or you already defined "provider.vpc" in serverless.yml`, "LIFT_ONLY_ONE_VPC");
    }
    this.serverless.service.provider.vpc = {
      securityGroupIds: securityGroups,
      subnetIds: subnets
    };
  }
  getVpcConfig() {
    var _a;
    return (_a = this.serverless.service.provider.vpc) != null ? _a : null;
  }
  async getStackOutput(output) {
    return (0, import_CloudFormation.getStackOutput)(this, output);
  }
  request(service, method, params) {
    return (0, import_aws2.awsRequest)(params, service, method, this.legacyProvider);
  }
  appendCloudformationResources() {
    (0, import_lodash.merge)(this.serverless.service, {
      resources: this.app.synth().getStackByName(this.stack.stackName).template
    });
  }
};
let AwsProvider = _AwsProvider;
AwsProvider.type = "aws";
AwsProvider.schema = AWS_DEFINITION;
AwsProvider.constructClasses = {};
AwsProvider.registerConstructs(import_aws.Storage, import_aws.Queue, import_aws.Webhook, import_aws.SinglePageApp, import_aws.StaticWebsite, import_aws.Vpc, import_aws.DatabaseDynamoDBSingleTable, import_aws.ServerSideWebsite);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AwsProvider
});
//# sourceMappingURL=AwsProvider.js.map
