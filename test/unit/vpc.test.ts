import { cloneDeep, get, merge } from "lodash";
import type { AwsCfInstruction } from "@serverless/typescript";
import { baseConfig, pluginConfigExt, runServerless } from "../utils/runServerless";
import ServerlessError from "../../src/utils/error";

describe("vpc", () => {
    it("should put Lambda functions in the VPC", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "vpc",
            configExt: pluginConfigExt,
            command: "package",
        });

        const vpcConfig = get(cfTemplate.Resources.FooLambdaFunction, "Properties.VpcConfig") as Record<
            string,
            unknown
        >;
        expect(vpcConfig).toHaveProperty("SecurityGroupIds");
        expect((vpcConfig.SecurityGroupIds as AwsCfInstruction[])[0]).toMatchObject({
            "Fn::GetAtt": [computeLogicalId("vpc", "AppSecurityGroup"), "GroupId"],
        });
        expect(vpcConfig).toHaveProperty("SubnetIds");
        expect(vpcConfig.SubnetIds).toContainEqual({
            Ref: computeLogicalId("vpc", "PrivateSubnet1", "Subnet"),
        });
        expect(vpcConfig.SubnetIds).toContainEqual({
            Ref: computeLogicalId("vpc", "PrivateSubnet2", "Subnet"),
        });
    });
    it("throws an error when using the construct twice", async () => {
        expect.assertions(2);

        try {
            await runServerless({
                config: merge({}, baseConfig, {
                    constructs: {
                        vpc1: {
                            type: "vpc",
                        },
                        vpc2: {
                            type: "vpc",
                        },
                    },
                }),
                command: "package",
            });
        } catch (error) {
            expect(error).toBeInstanceOf(ServerlessError);
            expect(error).toHaveProperty("code", "LIFT_ONLY_ONE_VPC");
        }
    });
    it("throws an error when there is an existing VPC config", async () => {
        expect.assertions(2);

        try {
            await runServerless({
                fixture: "vpc",
                configExt: merge({}, pluginConfigExt, {
                    provider: {
                        name: "aws",
                        vpc: {
                            securityGroupIds: ["sg-00000000000000000"],
                            subnetIds: ["subnet-01234567899999999", "subnet-00000000099999999"],
                        },
                    },
                }),
                command: "package",
            });
        } catch (error) {
            expect(error).toBeInstanceOf(ServerlessError);
            expect(error).toHaveProperty("code", "LIFT_ONLY_ONE_VPC");
        }
    });
    it("should create all required resources", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            fixture: "vpc",
            configExt: cloneDeep(pluginConfigExt),
            command: "package",
        });

        const vpcId = computeLogicalId("vpc");
        const securityGroupId = computeLogicalId("vpc", "AppSecurityGroup");

        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            "FooLogGroup",
            "IamRoleLambdaExecution",
            "FooLambdaFunction",

            // VPC
            vpcId,

            // Public Subnet 1
            computeLogicalId("vpc", "PublicSubnet1", "Subnet"),
            computeLogicalId("vpc", "PublicSubnet1", "RouteTable"),
            computeLogicalId("vpc", "PublicSubnet1", "RouteTableAssociation"),
            computeLogicalId("vpc", "PublicSubnet1", "DefaultRoute"),
            computeLogicalId("vpc", "PublicSubnet1", "EIP"),
            computeLogicalId("vpc", "PublicSubnet1", "NATGateway"),

            // Public Subnet 2
            computeLogicalId("vpc", "PublicSubnet2", "Subnet"),
            computeLogicalId("vpc", "PublicSubnet2", "RouteTable"),
            computeLogicalId("vpc", "PublicSubnet2", "RouteTableAssociation"),
            computeLogicalId("vpc", "PublicSubnet2", "DefaultRoute"),
            computeLogicalId("vpc", "PublicSubnet2", "EIP"),
            computeLogicalId("vpc", "PublicSubnet2", "NATGateway"),

            // Private Subnet 1
            computeLogicalId("vpc", "PrivateSubnet1", "Subnet"),
            computeLogicalId("vpc", "PrivateSubnet1", "RouteTable"),
            computeLogicalId("vpc", "PrivateSubnet1", "RouteTableAssociation"),
            computeLogicalId("vpc", "PrivateSubnet1", "DefaultRoute"),

            // Private Subnet 2
            computeLogicalId("vpc", "PrivateSubnet2", "Subnet"),
            computeLogicalId("vpc", "PrivateSubnet2", "RouteTable"),
            computeLogicalId("vpc", "PrivateSubnet2", "RouteTableAssociation"),
            computeLogicalId("vpc", "PrivateSubnet2", "DefaultRoute"),

            // Internet Gateway
            computeLogicalId("vpc", "IGW"),
            computeLogicalId("vpc", "VPCGW"),

            // Security Group
            securityGroupId,
        ]);

        expect(cfTemplate.Resources[vpcId]).toStrictEqual({
            Type: "AWS::EC2::VPC",
            Properties: {
                CidrBlock: "10.0.0.0/16",
                EnableDnsHostnames: true,
                EnableDnsSupport: true,
                InstanceTenancy: "default",
                Tags: [{ Key: "Name", Value: "Default/vpc" }],
            },
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
                    { Key: "Name", Value: "Default/vpc/PublicSubnet1" },
                ],
                VpcId: { Ref: vpcId },
            },
        });

        expect(cfTemplate.Resources[computeLogicalId("vpc", "PublicSubnet1", "RouteTable")]).toStrictEqual({
            Type: "AWS::EC2::RouteTable",
            Properties: {
                VpcId: { Ref: vpcId },
                Tags: [{ Key: "Name", Value: "Default/vpc/PublicSubnet1" }],
            },
        });

        expect(cfTemplate.Resources[computeLogicalId("vpc", "PublicSubnet1", "NATGateway")]).toStrictEqual({
            Type: "AWS::EC2::NatGateway",
            Properties: {
                AllocationId: { "Fn::GetAtt": [computeLogicalId("vpc", "PublicSubnet1", "EIP"), "AllocationId"] },
                SubnetId: { Ref: computeLogicalId("vpc", "PublicSubnet1", "Subnet") },
                Tags: [{ Key: "Name", Value: "Default/vpc/PublicSubnet1" }],
            },
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
                    { Key: "Name", Value: "Default/vpc/PrivateSubnet1" },
                ],
            },
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
                        IpProtocol: "-1",
                    },
                ],
            },
        });
    });
});
