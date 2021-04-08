import {Component} from "./Component";
import {CloudFormationOutputs, CloudFormationResources, Stack} from '../Stack';
import {cidrSubnets, cidrVpc, getZoneId} from '../Cidr';

export type VpcDetails = {
    securityGroupIds: (string|object)[];
    subnetIds: (string|object)[];
};

export class Vpc extends Component {
    private readonly props: Record<string, any>;

    private readonly vpcResourceId = this.formatCloudFormationId('Vpc');
    private readonly internetGatewayResourceId = this.formatCloudFormationId('VpcInternetGateway');
    private readonly appSecurityGroupResourceId = this.formatCloudFormationId('AppSecurityGroup');
    private readonly dbSecurityGroupResourceId = this.formatCloudFormationId('DBSecurityGroup');

    constructor(stack: Stack, props: Record<string, any> | null) {
        super(stack);
        this.props = props ? props : {};
    }

    compile(): CloudFormationResources {
        const availabilityZones = this.stack.availabilityZones();

        // NAT Gateway is enabled by default
        const enableNat = (this.props.nat !== false);
        let nat: CloudFormationResources = {};
        if (enableNat) {
            nat = this.compileNatGateway(availabilityZones);
        }

        return {
            [this.vpcResourceId]: {
                Type: 'AWS::EC2::VPC',
                Properties: {
                    CidrBlock: cidrVpc,
                    // TODO why?
                    EnableDnsSupport: true,
                    EnableDnsHostnames: true,
                    Tags: [
                        this.tag('Name', this.stackName),
                    ],
                },
            },
            [this.internetGatewayResourceId]: {
                Type: 'AWS::EC2::InternetGateway',
                Properties: {
                    Tags: [
                        this.tag('Name', `${this.stackName}-igw`),
                        // ?
                        this.tag('Network', 'Public'),
                    ]
                }
            },
            [this.formatCloudFormationId('VpcInternetGatewayAttachment')]: {
                Type: 'AWS::EC2::VPCGatewayAttachment',
                Properties: {
                    InternetGatewayId: this.fnRef(this.formatCloudFormationId('VpcInternetGateway')),
                    VpcId: this.fnRef(this.vpcResourceId),
                },
            },

            ...this.compileSubnets('Public', availabilityZones),

            ...this.compileSubnets('Private', availabilityZones),

            [this.appSecurityGroupResourceId]: {
                Type: 'AWS::EC2::SecurityGroup',
                Properties: {
                    GroupDescription: 'Application security group',
                    VpcId: this.fnRef(this.vpcResourceId),
                    SecurityGroupEgress: [
                        {
                            Description: 'Allow all output requests',
                            IpProtocol: '-1',
                            CidrIp: '0.0.0.0/0',
                        },
                    ],
                    SecurityGroupIngress: [
                        {
                            Description: 'Allow HTTPS inbound',
                            IpProtocol: 'tcp',
                            FromPort: 443,
                            ToPort: 443,
                            CidrIp: '0.0.0.0/0',
                        },
                    ],
                    Tags: [
                        this.tag('Name', `${this.stackName}-app-sg`),
                    ]
                }
            },
            [this.formatCloudFormationId('AppSecurityGroupEgressIPv4')]: {
                Type: 'AWS::EC2::SecurityGroupEgress',
                Properties: {
                    Description: 'Allow Lambda to reach anything anywhere (MySQL but also any API or other service)',
                    GroupId: this.fnRef(this.appSecurityGroupResourceId),
                    IpProtocol: '-1', // -1 => TPC + UDP (all protocols)
                    CidrIp: '0.0.0.0/0', // All IPv4 destinations
                    FromPort: '0',
                    ToPort: '65535',
                }
            },
            [this.formatCloudFormationId('AppSecurityGroupEgressIPv6')]: {
                Type: 'AWS::EC2::SecurityGroupEgress',
                Properties: {
                    Description: 'Allow Lambda to reach anything anywhere (MySQL but also any API or other service)',
                    GroupId: this.fnRef(this.appSecurityGroupResourceId),
                    IpProtocol: '-1', // -1 => TPC + UDP (all protocols)
                    CidrIpv6: '::/0', // All IPv6 destinations
                    FromPort: '0',
                    ToPort: '65535',
                }
            },

            [this.dbSecurityGroupResourceId]: {
                Type: 'AWS::EC2::SecurityGroup',
                Properties: {
                    GroupDescription: 'Database security group',
                    VpcId: this.fnRef(this.vpcResourceId),
                    SecurityGroupIngress: [
                        {
                            Description: 'Allow inbound MySQL access from Lambda',
                            IpProtocol: 'tcp',
                            FromPort: 3306,
                            ToPort: 3306,
                            SourceSecurityGroupId: this.fnRef(this.appSecurityGroupResourceId),
                        }
                    ],
                    Tags: [
                        this.tag('Name', `${this.stackName}-db-sg`),
                    ]
                }
            },

            [this.formatCloudFormationId('DHCPOptions')]: {
                Type: 'AWS::EC2::DHCPOptions',
                Properties: {
                    DomainName: `${this.stack.region}.compute.internal`,
                    DomainNameServers: ['AmazonProvidedDNS'],
                    Tags: [
                        this.tag('Name', `${this.stackName}-DHCPOptionsSet`),
                    ],
                }
            },
            [this.formatCloudFormationId('DHCPOptionsAssociation')]: {
                Type: 'AWS::EC2::VPCDHCPOptionsAssociation',
                Properties: {
                    VpcId: this.fnRef(this.vpcResourceId),
                    DhcpOptionsId: this.fnRef(this.formatCloudFormationId('DHCPOptions')),
                }
            },

            ...nat,
        };
    }

    outputs() {
        const zones = this.stack.availabilityZones();
        return {
            // VPC ID
            [this.vpcResourceId + 'Id']: {
                Description: 'VPC ID',
                Value: this.fnRef(this.vpcResourceId),
            },
            // App security group ID -> to be used by the serverless app
            [this.appSecurityGroupResourceId + 'Id']: {
                Description: 'Application security group ID',
                Value: this.fnRef(this.appSecurityGroupResourceId),
            },
            // Private subnet IDs -> to be used by the serverless app
            ...Object.assign({}, ...zones.map((zone): CloudFormationOutputs => {
                const subnetResourceId = this.formatCloudFormationId(`SubnetPrivate-${zone}`);
                return {
                    [subnetResourceId + 'Id']: {
                        Description: `Private subnet ID for zone ${zone}`,
                        Value: this.fnRef(subnetResourceId),
                    },
                };
            })),
        };
    }

    async permissionsReferences() {
        return [];
    }

    async detailsReferences(): Promise<VpcDetails> {
        const zones = this.stack.availabilityZones();
        return {
            securityGroupIds: [
                this.fnRef(this.appSecurityGroupResourceId),
            ],
            // Put Lambda in the private subnets
            subnetIds: await Promise.all(zones.map(async zone => {
                const subnetResourceId = this.formatCloudFormationId(`SubnetPrivate-${zone}`);
                return this.fnRef(subnetResourceId);
            })),
        };
    }

    compileSubnets(subnetName: 'Public'|'Private', availabilityZones: string[]) {
        const subnets = availabilityZones.map(zone => this.compileSubnet(subnetName, zone));
        // Merge all into a single object
        return Object.assign({}, ...subnets);
    }

    compileSubnet(type: 'Public'|'Private', zone: string) {
        const subnetResourceId = this.formatCloudFormationId(`Subnet${type}-${zone}`);
        const routeTableResourceId = this.formatCloudFormationId(`RouteTable${type}-${zone}`);

        // If public subnet, we route the internet traffic to the internet gateway
        let publicRoute = {};
        if (type === 'Public') {
            publicRoute = {
                [this.formatCloudFormationId(`Route${type}-${zone}`)]: {
                    Type: 'AWS::EC2::Route',
                    Properties: {
                        DestinationCidrBlock: '0.0.0.0/0',
                        RouteTableId: this.fnRef(routeTableResourceId),
                        GatewayId: this.fnRef(this.internetGatewayResourceId),
                    },
                    DependsOn: [
                        this.formatCloudFormationId('VpcInternetGatewayAttachment'),
                    ],
                },
            };
        }

        return {
            [subnetResourceId]: {
                Type: 'AWS::EC2::Subnet',
                Properties: {
                    VpcId: this.fnRef(this.vpcResourceId),
                    AvailabilityZone: zone,
                    CidrBlock: cidrSubnets[getZoneId(zone)][type],
                    Tags: [
                        this.tag('Name', `${this.stackName}-${type}-${zone}`.toLowerCase()),
                        // ?
                        this.tag('Network', type),
                    ],
                },
            },
            [routeTableResourceId]: {
                Type: 'AWS::EC2::RouteTable',
                Properties: {
                    VpcId: this.fnRef(this.vpcResourceId),
                    Tags: [
                        this.tag('Name', `${this.stackName}-${type}-${zone}`.toLowerCase()),
                        // ?
                        this.tag('Network', type),
                    ],
                },
            },
            [this.formatCloudFormationId(`RouteTableAssociation${type}-${zone}`)]: {
                Type: 'AWS::EC2::SubnetRouteTableAssociation',
                Properties: {
                    SubnetId: this.fnRef(subnetResourceId),
                    RouteTableId: this.fnRef(routeTableResourceId),
                },
            },
            ...publicRoute,
        };
    }

    private compileNatGateway(availabilityZones: string[]): CloudFormationResources {
        const natGatewayId = this.formatCloudFormationId('NatGateway');
        const elasticIpId = this.formatCloudFormationId('NatGatewayElasticIp');

        const routeTables = Object.assign({}, ...availabilityZones.map(zone => {
            return {
                [this.formatCloudFormationId(`RoutePrivate-${zone}`)]: {
                    Type: `AWS::EC2::Route`,
                    Properties: {
                        // Route from the private subnet to the internet via the NAT Gateway
                        DestinationCidrBlock: '0.0.0.0/0',
                        RouteTableId: this.fnRef(this.formatCloudFormationId(`RouteTablePrivate-${zone}`)),
                        NatGatewayId: this.fnRef(natGatewayId),
                    },
                },
            };
        }));

        return {
            [natGatewayId]: {
                Type: 'AWS::EC2::NatGateway',
                Properties: {
                    AllocationId: this.fnGetAtt(elasticIpId, 'AllocationId'),
                    // Put the NAT Gateway in the first AZ
                    SubnetId: this.fnRef(this.formatCloudFormationId(`SubnetPublic-${availabilityZones[0]}`)),
                    Tags: [
                        this.tag('Name', this.stackName),
                        this.tag('Network', 'Public'),
                    ],
                },
            },
            [elasticIpId]: {
                Type: 'AWS::EC2::EIP',
                Properties: {
                    Domain: 'vpc',
                    Tags: [
                        this.tag('Name', `${this.stackName} NAT Gateway`),
                    ],
                },
            },
            ...routeTables,
        };
    }
}
