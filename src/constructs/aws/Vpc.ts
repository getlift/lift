import { Vpc as CdkVpc, Peer, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import type { Construct as CdkConstruct } from "constructs";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import type { ConstructInterface } from "@lift/constructs";

const VPC_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "vpc" },
    },
    additionalProperties: false,
    required: [],
} as const;

type Configuration = FromSchema<typeof VPC_DEFINITION>;

export class Vpc extends CdkVpc implements ConstructInterface {
    public static type = "vpc";
    public static schema = VPC_DEFINITION;

    static create(provider: AwsProvider, id: string, configuration: Configuration): Vpc {
        return new this(provider.stack, id, configuration, provider);
    }

    private readonly appSecurityGroup: SecurityGroup;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id, {
            maxAzs: 2,
        });

        // Add a security group for the Lambda functions
        this.appSecurityGroup = new SecurityGroup(this, "AppSecurityGroup", {
            vpc: this,
        });
        // Lambda is allowed to reach out to the whole internet
        this.appSecurityGroup.addEgressRule(Peer.anyIpv4(), Port.allTraffic());

        // Auto-register the VPC
        provider.setVpcConfig(
            [this.appSecurityGroup.securityGroupId],
            this.privateSubnets.map((subnet) => subnet.subnetId)
        );
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {};
    }
}
