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
var import_lodash = __toModule(require("lodash"));
var import_runServerless = __toModule(require("../utils/runServerless"));
var import_error = __toModule(require("../../src/utils/error"));
describe("vpc", () => {
  it("should put Lambda functions in the VPC", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      fixture: "vpc",
      configExt: import_runServerless.pluginConfigExt,
      command: "package"
    });
    const vpcConfig = (0, import_lodash.get)(cfTemplate.Resources.FooLambdaFunction, "Properties.VpcConfig");
    expect(vpcConfig).toHaveProperty("SecurityGroupIds");
    expect(vpcConfig.SecurityGroupIds[0]).toMatchObject({
      "Fn::GetAtt": [computeLogicalId("vpc", "AppSecurityGroup"), "GroupId"]
    });
    expect(vpcConfig).toHaveProperty("SubnetIds");
    expect(vpcConfig.SubnetIds).toContainEqual({
      Ref: computeLogicalId("vpc", "PrivateSubnet1", "Subnet")
    });
    expect(vpcConfig.SubnetIds).toContainEqual({
      Ref: computeLogicalId("vpc", "PrivateSubnet2", "Subnet")
    });
  });
  it("throws an error when using the construct twice", async () => {
    expect.assertions(2);
    try {
      await (0, import_runServerless.runServerless)({
        config: (0, import_lodash.merge)({}, import_runServerless.baseConfig, {
          constructs: {
            vpc1: {
              type: "vpc"
            },
            vpc2: {
              type: "vpc"
            }
          }
        }),
        command: "package"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(import_error.default);
      expect(error).toHaveProperty("code", "LIFT_ONLY_ONE_VPC");
    }
  });
  it("throws an error when there is an existing VPC config", async () => {
    expect.assertions(2);
    try {
      await (0, import_runServerless.runServerless)({
        fixture: "vpc",
        configExt: (0, import_lodash.merge)({}, import_runServerless.pluginConfigExt, {
          provider: {
            name: "aws",
            vpc: {
              securityGroupIds: ["sg-00000000000000000"],
              subnetIds: ["subnet-01234567899999999", "subnet-00000000099999999"]
            }
          }
        }),
        command: "package"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(import_error.default);
      expect(error).toHaveProperty("code", "LIFT_ONLY_ONE_VPC");
    }
  });
  it("should create all required resources", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      fixture: "vpc",
      configExt: (0, import_lodash.cloneDeep)(import_runServerless.pluginConfigExt),
      command: "package"
    });
    const vpcId = computeLogicalId("vpc");
    const securityGroupId = computeLogicalId("vpc", "AppSecurityGroup");
    expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
      "ServerlessDeploymentBucket",
      "ServerlessDeploymentBucketPolicy",
      "FooLogGroup",
      "IamRoleLambdaExecution",
      "FooLambdaFunction",
      vpcId,
      computeLogicalId("vpc", "PublicSubnet1", "Subnet"),
      computeLogicalId("vpc", "PublicSubnet1", "RouteTable"),
      computeLogicalId("vpc", "PublicSubnet1", "RouteTableAssociation"),
      computeLogicalId("vpc", "PublicSubnet1", "DefaultRoute"),
      computeLogicalId("vpc", "PublicSubnet1", "EIP"),
      computeLogicalId("vpc", "PublicSubnet1", "NATGateway"),
      computeLogicalId("vpc", "PublicSubnet2", "Subnet"),
      computeLogicalId("vpc", "PublicSubnet2", "RouteTable"),
      computeLogicalId("vpc", "PublicSubnet2", "RouteTableAssociation"),
      computeLogicalId("vpc", "PublicSubnet2", "DefaultRoute"),
      computeLogicalId("vpc", "PublicSubnet2", "EIP"),
      computeLogicalId("vpc", "PublicSubnet2", "NATGateway"),
      computeLogicalId("vpc", "PrivateSubnet1", "Subnet"),
      computeLogicalId("vpc", "PrivateSubnet1", "RouteTable"),
      computeLogicalId("vpc", "PrivateSubnet1", "RouteTableAssociation"),
      computeLogicalId("vpc", "PrivateSubnet1", "DefaultRoute"),
      computeLogicalId("vpc", "PrivateSubnet2", "Subnet"),
      computeLogicalId("vpc", "PrivateSubnet2", "RouteTable"),
      computeLogicalId("vpc", "PrivateSubnet2", "RouteTableAssociation"),
      computeLogicalId("vpc", "PrivateSubnet2", "DefaultRoute"),
      computeLogicalId("vpc", "IGW"),
      computeLogicalId("vpc", "VPCGW"),
      securityGroupId
    ]);
    expect(cfTemplate.Resources[vpcId]).toStrictEqual({
      Type: "AWS::EC2::VPC",
      Properties: {
        CidrBlock: "10.0.0.0/16",
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
        InstanceTenancy: "default",
        Tags: [{ Key: "Name", Value: "Default/vpc" }]
      }
    });
    expect(cfTemplate.Resources[computeLogicalId("vpc", "PublicSubnet1", "Subnet")]).toStrictEqual({
      Type: "AWS::EC2::Subnet",
      Properties: {
        AvailabilityZone: { "Fn::Select": [0, { "Fn::GetAZs": "" }] },
        CidrBlock: "10.0.0.0/18",
        MapPublicIpOnLaunch: true,
        Tags: [
          { Key: "aws-cdk:subnet-name", Value: "Public" },
          { Key: "aws-cdk:subnet-type", Value: "Public" },
          { Key: "Name", Value: "Default/vpc/PublicSubnet1" }
        ],
        VpcId: { Ref: vpcId }
      }
    });
    expect(cfTemplate.Resources[computeLogicalId("vpc", "PublicSubnet1", "RouteTable")]).toStrictEqual({
      Type: "AWS::EC2::RouteTable",
      Properties: {
        VpcId: { Ref: vpcId },
        Tags: [{ Key: "Name", Value: "Default/vpc/PublicSubnet1" }]
      }
    });
    expect(cfTemplate.Resources[computeLogicalId("vpc", "PublicSubnet1", "NATGateway")]).toStrictEqual({
      Type: "AWS::EC2::NatGateway",
      DependsOn: [
        computeLogicalId("vpc", "PublicSubnet1", "DefaultRoute"),
        computeLogicalId("vpc", "PublicSubnet1", "RouteTableAssociation")
      ],
      Properties: {
        AllocationId: { "Fn::GetAtt": [computeLogicalId("vpc", "PublicSubnet1", "EIP"), "AllocationId"] },
        SubnetId: { Ref: computeLogicalId("vpc", "PublicSubnet1", "Subnet") },
        Tags: [{ Key: "Name", Value: "Default/vpc/PublicSubnet1" }]
      }
    });
    expect(cfTemplate.Resources[computeLogicalId("vpc", "PrivateSubnet1", "Subnet")]).toStrictEqual({
      Type: "AWS::EC2::Subnet",
      Properties: {
        VpcId: { Ref: vpcId },
        AvailabilityZone: { "Fn::Select": [0, { "Fn::GetAZs": "" }] },
        CidrBlock: "10.0.128.0/18",
        MapPublicIpOnLaunch: false,
        Tags: [
          { Key: "aws-cdk:subnet-name", Value: "Private" },
          { Key: "aws-cdk:subnet-type", Value: "Private" },
          { Key: "Name", Value: "Default/vpc/PrivateSubnet1" }
        ]
      }
    });
    expect(cfTemplate.Resources[securityGroupId]).toMatchObject({
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        VpcId: { Ref: vpcId },
        GroupDescription: "Default/vpc/AppSecurityGroup",
        SecurityGroupEgress: [
          {
            CidrIp: "0.0.0.0/0",
            Description: "Allow all outbound traffic by default",
            IpProtocol: "-1"
          }
        ]
      }
    });
  });
});
//# sourceMappingURL=vpc.test.js.map
