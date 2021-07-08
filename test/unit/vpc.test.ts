import { cloneDeep, get, merge } from "lodash";
import { AwsCfInstruction } from "@serverless/typescript";
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
            Ref: computeLogicalId("vpc", "AppSecurityGroup"),
        });
        expect(vpcConfig).toHaveProperty("SubnetIds");
        expect(vpcConfig.SubnetIds).toContainEqual({
            Ref: computeLogicalId("vpc", "VPC", "PrivateSubnet1", "Subnet"),
        });
        expect(vpcConfig.SubnetIds).toContainEqual({
            Ref: computeLogicalId("vpc", "VPC", "PrivateSubnet2", "Subnet"),
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

        const vpcId = computeLogicalId("vpc", "VPC");
        const securityGroupId = computeLogicalId("vpc", "AppSecurityGroup");

        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            "FooLogGroup",
            "IamRoleLambdaExecution",
            "FooLambdaFunction",
            expect.stringMatching(/FooLambdaVersion\w+/),

            // VPC
            vpcId,

            // Public Subnet 1
            computeLogicalId("vpc", "VPC", "PublicSubnet1", "Subnet"),
            computeLogicalId("vpc", "VPC", "PublicSubnet1", "RouteTable"),
            computeLogicalId("vpc", "VPC", "PublicSubnet1", "RouteTableAssociation"),
            computeLogicalId("vpc", "VPC", "PublicSubnet1", "DefaultRoute"),
            computeLogicalId("vpc", "VPC", "PublicSubnet1", "EIP"),
            computeLogicalId("vpc", "VPC", "PublicSubnet1", "NATGateway"),

            // Public Subnet 2
            computeLogicalId("vpc", "VPC", "PublicSubnet2", "Subnet"),
            computeLogicalId("vpc", "VPC", "PublicSubnet2", "RouteTable"),
            computeLogicalId("vpc", "VPC", "PublicSubnet2", "RouteTableAssociation"),
            computeLogicalId("vpc", "VPC", "PublicSubnet2", "DefaultRoute"),
            computeLogicalId("vpc", "VPC", "PublicSubnet2", "EIP"),
            computeLogicalId("vpc", "VPC", "PublicSubnet2", "NATGateway"),

            // Private Subnet 1
            computeLogicalId("vpc", "VPC", "PrivateSubnet1", "Subnet"),
            computeLogicalId("vpc", "VPC", "PrivateSubnet1", "RouteTable"),
            computeLogicalId("vpc", "VPC", "PrivateSubnet1", "RouteTableAssociation"),
            computeLogicalId("vpc", "VPC", "PrivateSubnet1", "DefaultRoute"),

            // Private Subnet 2
            computeLogicalId("vpc", "VPC", "PrivateSubnet2", "Subnet"),
            computeLogicalId("vpc", "VPC", "PrivateSubnet2", "RouteTable"),
            computeLogicalId("vpc", "VPC", "PrivateSubnet2", "RouteTableAssociation"),
            computeLogicalId("vpc", "VPC", "PrivateSubnet2", "DefaultRoute"),

            // Internet Gateway
            computeLogicalId("vpc", "VPC", "IGW"),
            computeLogicalId("vpc", "VPC", "VPCGW"),

            // Security Group
            securityGroupId,
        ]);

        expect(cfTemplate.Resources[securityGroupId]).toMatchObject({
            Type: "AWS::EC2::SecurityGroup",
            Properties: {
                GroupDescription: "Default/vpc/AppSecurityGroup",
                SecurityGroupEgress: [
                    {
                        CidrIp: "0.0.0.0/0",
                        Description: "Allow all outbound traffic by default",
                        IpProtocol: "-1",
                    },
                ],
                VpcId: {
                    Ref: vpcId,
                },
            },
        });
    });
});
