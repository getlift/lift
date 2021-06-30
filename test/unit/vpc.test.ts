import { get } from "lodash";
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
                config: Object.assign(baseConfig, {
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
                configExt: Object.assign(pluginConfigExt, {
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
});
