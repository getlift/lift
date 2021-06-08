import type { Construct as CdkConstruct } from "@aws-cdk/core";
import { CfnOutput, Duration, SecretValue } from "@aws-cdk/core";
import type { FromSchema } from "json-schema-to-ts";
import {
    Credentials,
    DatabaseInstance,
    DatabaseInstanceEngine,
    MariaDbEngineVersion,
    MysqlEngineVersion,
    PostgresEngineVersion,
} from "@aws-cdk/aws-rds";
import { InstanceType, SubnetType } from "@aws-cdk/aws-ec2";
import type { IInstanceEngine } from "@aws-cdk/aws-rds/lib/instance-engine";
import { AwsConstruct } from "@lift/constructs/abstracts";
import type { AwsProvider } from "@lift/providers";

const SCHEMA = {
    type: "object",
    properties: {
        name: {
            type: "string",
            pattern: "^[\\w\\d-_]*$/",
        },
        engine: {
            type: "string",
            enum: ["mysql", "mariadb", "postgres"],
        },
        username: {
            type: "string",
        },
        password: {
            type: "string",
            minLength: 8,
        },
        instanceType: { type: "string" },
        storageSize: {
            type: "integer",
            minimum: 20,
        },
    },
    additionalProperties: false,
    required: [],
} as const;

type Configuration = FromSchema<typeof SCHEMA>;

export class DatabaseSql extends AwsConstruct {
    public static type = "database/sql";
    public static schema = SCHEMA;

    private readonly dbInstance: DatabaseInstance;
    private readonly dbHostOutput: CfnOutput;
    private readonly username: string;
    private passwordSecretName: string | undefined;

    constructor(
        scope: CdkConstruct,
        private readonly id: string,
        private readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);

        const vpc = provider.enableVpc();

        this.username = this.configuration.username ?? "admin";

        this.dbInstance = new DatabaseInstance(this, "Instance", {
            // https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-rds.DatabaseInstance.html#construct-props
            instanceIdentifier: configuration.name ?? `${this.provider.stackName}-${id}`,
            databaseName: this.safeDbName(configuration.name ?? `${this.provider.stackName}-${id}`),
            engine: this.getEngineVersion(),
            instanceType: new InstanceType(configuration.instanceType ?? "t3.micro"),
            credentials: this.credentials(),
            vpc,
            // Put the instance in the private subnet
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE,
            },
            // We go with 20 (the minimum) instead of 100 by default, because it is much cheaper
            allocatedStorage: configuration.storageSize ?? 20,
            // 7 days backups instead of the default 1
            backupRetention: Duration.days(7),
            cloudwatchLogsExports: this.logsToEnable(),
        });

        this.dbHostOutput = new CfnOutput(this, "DbHost", {
            value: this.dbInstance.instanceEndpoint.hostname,
        });
    }

    private credentials() {
        const password = this.configuration.password ?? "";
        if (password === "") {
            // If no password is defined, a random one will be generated and stored in Secrets Manager
            this.passwordSecretName = `${this.provider.stackName}/${this.id}/password`;

            return Credentials.fromGeneratedSecret(this.username, {
                secretName: this.passwordSecretName,
            });
        }

        return Credentials.fromPassword(this.username, SecretValue.plainText(password));
    }

    commands(): Record<string, () => void | Promise<void>> {
        return {};
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            host: () => this.provider.getStackOutput(this.dbHostOutput),
        };
    }

    variables(): Record<string, unknown> {
        return {
            host: this.dbInstance.instanceEndpoint.hostname,
            port: this.dbInstance.instanceEndpoint.port,
            username: this.username,
            passwordSecret: this.passwordSecretName,
        };
    }

    private safeDbName(name: string): string {
        return name.replace(/-/g, "").replace(/_/g, "");
    }

    private getEngine() {
        return this.configuration.engine ?? "mysql";
    }

    private getEngineVersion(): IInstanceEngine {
        switch (this.getEngine()) {
            case "mysql":
                return DatabaseInstanceEngine.mysql({
                    version: MysqlEngineVersion.of("8.0.23", "8.0"),
                });
            case "mariadb":
                return DatabaseInstanceEngine.mariaDb({
                    version: MariaDbEngineVersion.of("10.5.8", "10.5"),
                });
            case "postgres":
                return DatabaseInstanceEngine.postgres({
                    version: PostgresEngineVersion.of("13.2", "13"),
                });
        }
    }

    private logsToEnable(): string[] {
        // https://docs.aws.amazon.com/fr_fr/AWSCloudFormation/latest/UserGuide/aws-properties-rds-database-instance.html#cfn-rds-dbinstance-enablecloudwatchlogsexports
        switch (this.getEngine()) {
            case "mysql":
                return ["error", "slowquery"];
            case "mariadb":
                return ["error", "slowquery"];
            case "postgres":
                return [];
        }
    }
}
