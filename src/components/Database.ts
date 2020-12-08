import {Component} from "./Component";
import {PolicyStatement} from "../utils/cloudformation";

export class Database extends Component {
    private readonly props: Record<string, any>;
    private readonly dbResourceName: string;

    constructor(stackName: string, props: Record<string, any> | null) {
        super(stackName);
        this.props = props ? props : {};

        this.dbResourceName = this.formatCloudFormationId('Database');
    }

    compile(): Record<string, any> {
        const db: any = {
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
            },
        };

        return {
            [this.dbResourceName]: db,
        };
    }

    outputs() {
        return {
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

    permissions(): PolicyStatement[] {
        return [];
    }

    envVariables() {
        let variables: Record<string, any> = {};

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
