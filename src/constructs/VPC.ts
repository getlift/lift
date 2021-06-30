import { SecurityGroup, Vpc } from "@aws-cdk/aws-ec2";
import { Construct as CdkConstruct } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { AwsCfInstruction } from "@serverless/typescript";
import { AwsConstruct, AwsProvider } from "../classes";

const VPC_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "vpc" },
    },
    additionalProperties: false,
    required: [],
} as const;

type Configuration = FromSchema<typeof VPC_DEFINITION>;

export class VPC extends AwsConstruct {
    public static type = "vpc";
    public static schema = VPC_DEFINITION;

    private readonly vpc: Vpc;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id);

        this.vpc = new Vpc(this, "VPC", {
            maxAzs: 2,
        });

        const privateSubnets = this.vpc.privateSubnets;

        const lambdaSecurityGroup = new SecurityGroup(this, "AppSecurityGroup", {
            vpc: this.vpc,
        });

        provider.setVpcConfig(
            provider.getCloudFormationReference(lambdaSecurityGroup.securityGroupName),
            privateSubnets.map((subnet) => provider.getCloudFormationReference(subnet.subnetId))
        );
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {};
    }

    references(): Record<string, AwsCfInstruction> {
        return {};
    }
}
