import {Component} from "./Component";
import {Stack} from '../Stack';
import {DBCluster, DBSubnetGroup, ScalingConfiguration} from 'aws-sdk/clients/rds';

type Engine = 'mysql' | 'mariadb' | 'postgres' | 'aurora' | 'aurora-mysql' | 'aurora-postgresql';

export class Database extends Component {
    private readonly props: Record<string, any>;
    private readonly dbResourceName: string;

    constructor(stack: Stack, props: Record<string, any> | null) {
        super(stack);
        this.props = props ? props : {};

        this.dbResourceName = this.formatCloudFormationId('Database');

        // We automatically enable a VPC in the stack
        this.stack.enableVpc();
    }

    compile(): Record<string, any> {
        const availabilityZones = this.stack.availabilityZones();
        const subnetGroupResourceId = this.formatCloudFormationId('DbSubnetGroup');

        const resources: Record<string, any> = {
            [subnetGroupResourceId]: {
                Type: 'AWS::RDS::DBSubnetGroup',
                Properties: {
                    DBSubnetGroupName: this.getDbName(),
                    DBSubnetGroupDescription: `${this.getDbName()} database`,
                    SubnetIds: availabilityZones.map(zone => {
                        return this.fnRef(this.formatCloudFormationId(`SubnetPrivate-${zone}`));
                    }),
                } as DBSubnetGroup,
            },
        };

        const instance = {
            Type: 'AWS::RDS::DBInstance',
            Properties: {
                DBInstanceIdentifier: this.getDbName(),
                DBName: this.getDbName(),
                Engine: this.getEngine(),
                MasterUsername: 'admin',
                MasterUserPassword: 'password',
                DBInstanceClass: this.props.class ? this.props.class : 'db.t3.micro',
                StorageType: 'gp2',
                AllocatedStorage: this.props.storageSize ? this.props.storageSize : '20', // minimum is 20 GB
                DBSubnetGroupName: this.fnRef(subnetGroupResourceId),
                VPCSecurityGroups: [
                    this.fnRef(this.formatCloudFormationId('DBSecurityGroup')),
                ],
            },
        };

        let cluster = null;
        if (this.isCluster()) {
            Object.assign(instance.Properties, {
                DBClusterIdentifier: this.fnRef(this.dbResourceName),
            });

            cluster = {
                Type: 'AWS::RDS::DBCluster',
                Properties: {
                    DBClusterIdentifier: this.getDbName(),
                    DatabaseName: this.getDbName(),
                    Engine: this.getEngine(),
                    // DBClusterParameterGroupName ?
                    MasterUsername: 'admin',
                    MasterUserPassword: 'password',
                    DBSubnetGroupName: this.fnRef(subnetGroupResourceId),
                    VpcSecurityGroupIds: [
                        this.fnRef(this.formatCloudFormationId('DBSecurityGroup')),
                    ],
                } as DBCluster,
            }
            resources[this.dbResourceName] = cluster;
            resources[this.dbResourceName + 'Instance'] = instance;
        } else {
            resources[this.dbResourceName] = instance;
        }

        if (this.props.serverless) {
            if (! cluster) throw new Error('RDS serverless can only be used with RDS engines of type `aurora`, `aurora-mysql` or `aurora-postgresql`')
            if (! ('max' in this.props.serverless)) throw new Error('The `max` key is required in the `db.serverless` config.');

            Object.assign(cluster.Properties, {
                EngineMode: 'serverless',
                EnableHttpEndpoint: true,
                ScalingConfiguration: {
                    MinCapacity: ('min' in this.props.serverless) ? this.props.serverless.min : '1',
                    MaxCapacity: this.props.serverless.max,
                    AutoPause: ('autoPause' in this.props.serverless) ? this.props.serverless.autoPause : false,
                    SecondsUntilAutoPause: 60 * 10, // 10 minutes
                } as ScalingConfiguration,
            });

            // Remove the DB instance from the template
            delete resources[this.dbResourceName + 'Instance'];
        }

        return resources;
    }

    outputs() {
        return {
            [this.dbResourceName + 'Name']: {
                Description: 'Name of the database.',
                Value: this.getDbName(),
            },
            [this.dbResourceName + 'Host']: {
                Description: 'Hostname of the database.',
                Value: this.fnGetAtt(this.dbResourceName, 'Endpoint.Address'),
            },
            [this.dbResourceName + 'Port']: {
                Description: 'Port of the database.',
                Value: this.fnGetAtt(this.dbResourceName, 'Endpoint.Port'),
            },
        };
    }

    async permissionsReferences() {
        return [];
    }

    private getEngine(): Engine {
        const availableEngines = [
            'mysql',
            'mariadb',
            'postgres',
            'aurora', // MySQL 5.6
            'aurora-mysql', // MySQL 5.7
            'aurora-postgresql',
        ];
        if (this.props.engine) {
            if (! availableEngines.includes(this.props.engine)) {
                throw new Error(`Unknown RDS engine "${this.props.engine}"`);
            }
            return this.props.engine;
        }
        if (this.props.serverless) {
            return 'aurora-mysql';
        }
        return 'mysql';
    }

    private isCluster(): boolean {
        const engine = this.getEngine();
        const isCluster = {
            'mysql': false,
            'mariadb': false,
            'postgres': false,
            'aurora': true,
            'aurora-mysql': true,
            'aurora-postgresql': true,
        };
        return isCluster[engine];
    }

    private getDbName(): string {
        const name = this.props.name ? this.props.name : this.stackName;
        if (! name.match(/^[\w\d]*$/g)) {
            throw new Error(`The database name '${name}' is invalid: it must only contain letters and numbers.`);
        }

        return name;
    }
}
