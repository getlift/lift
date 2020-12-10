import {Component} from "./Component";
import {Stack} from '../Stack';

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

        return {
            [this.dbResourceName]: {
                Type: 'AWS::RDS::DBInstance',
                Properties: {
                    DBName: this.getDbName(),
                    Engine: this.getEngine(),
                    MasterUsername: 'admin',
                    MasterUserPassword: 'password',
                    DBInstanceIdentifier: this.getDbName(),
                    DBInstanceClass: 'db.t3.micro',
                    StorageType: 'gp2',
                    AllocatedStorage: '20', // minimum is 20 GB
                    DBSubnetGroupName: this.fnRef(subnetGroupResourceId),
                    VPCSecurityGroups: [
                        this.fnRef(this.formatCloudFormationId('DBSecurityGroup')),
                    ],
                },
            },
            [subnetGroupResourceId]: {
                Type: 'AWS::RDS::DBSubnetGroup',
                Properties: {
                    DBSubnetGroupName: this.getDbName(),
                    DBSubnetGroupDescription: `${this.getDbName()} database`,
                    SubnetIds: availabilityZones.map(zone => {
                        return this.fnRef(this.formatCloudFormationId(`SubnetPrivate-${zone}`));
                    }),
                }
            },
        };
    }

    outputs() {
        return {
            [this.dbResourceName + 'Name']: {
                Description: 'Name of the database.',
                Value: this.getDbName(),
                Export: {
                    Name: this.stackName + '-' + this.dbResourceName + '-Name',
                },
            },
            [this.dbResourceName + 'Host']: {
                Description: 'Hostname of the database.',
                Value: this.fnGetAtt(this.dbResourceName, 'Endpoint.Address'),
                Export: {
                    Name: this.stackName + '-' + this.dbResourceName + '-Host',
                },
            },
            [this.dbResourceName + 'Port']: {
                Description: 'Port of the database.',
                Value: this.fnGetAtt(this.dbResourceName, 'Endpoint.Port'),
                Export: {
                    Name: this.stackName + '-' + this.dbResourceName + '-Port',
                },
            },
        };
    }

    permissions() {
        return [];
    }

    envVariables() {
        let variables: Record<string, any> = {};

        const dbName = this.fnImportValue(this.stackName + '-' + this.dbResourceName + '-Name');
        variables[this.formatEnvVariableName(this.dbResourceName + '_NAME')] = dbName;

        const dbHost = this.fnImportValue(this.stackName + '-' + this.dbResourceName + '-Host');
        variables[this.formatEnvVariableName(this.dbResourceName + '_HOST')] = dbHost;

        const dbPort = this.fnImportValue(this.stackName + '-' + this.dbResourceName + '-Port');
        variables[this.formatEnvVariableName(this.dbResourceName + '_PORT')] = dbPort;

        return variables;
    }

    private getEngine(): string {
        const availableEngines = [
            'mysql',
            'mariadb',
            'postgres',
            'aurora',
            'aurora-mysql',
            'aurora-postgresql',
        ];
        if (this.props.engine) {
            if (! availableEngines.includes(this.props.engine)) {
                throw new Error(`Unknown RDS engine "${this.props.engine}"`);
            }
            return this.props.engine;
        }
        return 'mysql';
    }

    private getDbName(): string {
        const name = this.props.name ? this.props.name : this.stackName;
        if (! name.match(/^[\w\d]*$/g)) {
            throw new Error(`The database name '${name}' is invalid: it must only contain letters and numbers.`);
        }

        return name;
    }
}
