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
  StaticWebsite: () => StaticWebsite
});
var cloudfront = __toModule(require("aws-cdk-lib/aws-cloudfront"));
var import_aws_cloudfront = __toModule(require("aws-cdk-lib/aws-cloudfront"));
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_cloudfrontFunctions = __toModule(require("../../classes/cloudfrontFunctions"));
var import_getDefaultCfnFunctionAssociations = __toModule(require("../../utils/getDefaultCfnFunctionAssociations"));
var import_naming = __toModule(require("../../utils/naming"));
var import_StaticWebsiteAbstract = __toModule(require("./abstracts/StaticWebsiteAbstract"));
class StaticWebsite extends import_StaticWebsiteAbstract.StaticWebsiteAbstract {
  constructor(scope, id, configuration, provider) {
    super(scope, id, configuration, provider);
    this.id = id;
    this.configuration = configuration;
    this.provider = provider;
    const cfnDistribution = this.distribution.node.defaultChild;
    const requestFunction = this.createRequestFunction();
    if (requestFunction === null) {
      return;
    }
    const defaultBehaviorFunctionAssociations = (0, import_getDefaultCfnFunctionAssociations.getCfnFunctionAssociations)(cfnDistribution);
    cfnDistribution.addOverride("Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations", [
      ...defaultBehaviorFunctionAssociations,
      { EventType: import_aws_cloudfront.FunctionEventType.VIEWER_REQUEST, FunctionARN: requestFunction.functionArn }
    ]);
  }
  createRequestFunction() {
    let additionalCode = "";
    if (this.configuration.redirectToMainDomain === true) {
      additionalCode += (0, import_cloudfrontFunctions.redirectToMainDomain)(this.domains);
    }
    if (additionalCode === "") {
      return null;
    }
    const code = `function handler(event) {
    var request = event.request;${additionalCode}
    return request;
}`;
    const functionName = (0, import_naming.ensureNameMaxLength)(`${this.provider.stackName}-${this.provider.region}-${this.id}-request`, 64);
    return new cloudfront.Function(this, "RequestFunction", {
      functionName,
      code: cloudfront.FunctionCode.fromInline(code)
    });
  }
  getBucketProps() {
    return {
      websiteIndexDocument: "index.html",
      websiteErrorDocument: this.errorPath(),
      publicReadAccess: true,
      removalPolicy: import_aws_cdk_lib.RemovalPolicy.DESTROY
    };
  }
}
StaticWebsite.type = "static-website";
StaticWebsite.schema = import_StaticWebsiteAbstract.COMMON_STATIC_WEBSITE_DEFINITION;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  StaticWebsite
});
//# sourceMappingURL=StaticWebsite.js.map
