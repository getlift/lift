import {Component} from "./Component";
import {PolicyStatement} from "../utils/cloudformation";

export class Database extends Component {
    private stackName: string;
    private props: Record<string, any>;
    private dbResourceName: string;

    constructor(stackName: string, props: Record<string, any> | null) {
        super();
        this.stackName = stackName;
        this.props = props ? props : {};

        this.dbResourceName = this.formatResourceName('Database');
    }

    compile(): Record<string, any> {
        const engines = [
            'mysql',
            'mariadb',
            'postgres',
            'aurora',
            'aurora-mysql',
            'aurora-postgresql',
        ];
        let engine = 'mysql';
        if (this.props.engine) {
            if (! engines.includes(this.props.engine)) {
                throw new Error(`Unknown RDS engine "${this.props.engine}"`);
            }
            engine = this.props.engine;
        }

        const db: any = {
            Type: 'AWS::RDS::DBInstance',
            Properties: {
                DBName: this.stackName,
                Engine: engine,
                MasterUsername: 'admin',
                MasterUserPassword: 'password',
                DBInstanceIdentifier: this.stackName,
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
}
