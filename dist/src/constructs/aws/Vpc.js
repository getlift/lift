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
  Vpc: () => Vpc
});
var import_aws_ec2 = __toModule(require("aws-cdk-lib/aws-ec2"));
const VPC_DEFINITION = {
  type: "object",
  properties: {
    type: { const: "vpc" }
  },
  additionalProperties: false,
  required: []
};
class Vpc extends import_aws_ec2.Vpc {
  constructor(scope, id, configuration, provider) {
    super(scope, id, {
      maxAzs: 2
    });
    this.provider = provider;
    this.appSecurityGroup = new import_aws_ec2.SecurityGroup(this, "AppSecurityGroup", {
      vpc: this
    });
    this.appSecurityGroup.addEgressRule(import_aws_ec2.Peer.anyIpv4(), import_aws_ec2.Port.allTraffic());
    provider.setVpcConfig([this.appSecurityGroup.securityGroupId], this.privateSubnets.map((subnet) => subnet.subnetId));
  }
  static create(provider, id, configuration) {
    return new this(provider.stack, id, configuration, provider);
  }
  outputs() {
    return {};
  }
}
Vpc.type = "vpc";
Vpc.schema = VPC_DEFINITION;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Vpc
});
//# sourceMappingURL=Vpc.js.map
