import {Component} from "./Component";

export class Database extends Component {
    private name: string;
    private props: Record<string, any>;
    private dbResourceName: string;

    constructor(name: string, props: Record<string, any> | null) {
        super();
        this.name = name;
        this.props = props ? props : {};

        this.dbResourceName = this.formatResourceName(this.name);
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
                DBName: this.name,
                Engine: engine,
                MasterUsername: 'admin',
                MasterUserPassword: 'password',
                DBInstanceIdentifier: this.name,
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
            },
            [this.dbResourceName + 'Port']: {
                Description: 'Port of the database.',
                Value: this.fnGetAtt(this.dbResourceName, 'Endpoint.Port'),
            },
        };
    }
}
