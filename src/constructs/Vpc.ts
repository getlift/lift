import { Vpc as CdkVpc, Peer, Port, SecurityGroup } from "@aws-cdk/aws-ec2";
import { Construct as CdkConstruct } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
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

export class Vpc extends AwsConstruct {
    public static type = "vpc";
    public static schema = VPC_DEFINITION;

    private readonly vpc: CdkVpc;
    private readonly appSecurityGroup: SecurityGroup;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id);

        this.vpc = new CdkVpc(this, "VPC", {
            maxAzs: 2,
        });

        const privateSubnets = this.vpc.privateSubnets;

        this.appSecurityGroup = new SecurityGroup(this, "AppSecurityGroup", {
            vpc: this.vpc,
        });

        this.appSecurityGroup.addEgressRule(Peer.anyIpv4(), Port.allTraffic());

        provider.setVpcConfig(
            [this.appSecurityGroup.securityGroupName],
            privateSubnets.map((subnet) => subnet.subnetId)
        );
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {};
    }
}
