import type { Construct as CdkConstruct } from "constructs";
import type { CfnResource } from "aws-cdk-lib";
import { CfnOutput, Fn, RemovalPolicy, Stack } from "aws-cdk-lib";
import type { CfnTable } from "aws-cdk-lib/aws-dynamodb";
import { AttributeType, BillingMode, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import { PolicyStatement } from "../../CloudFormation";

const DATABASE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "database/dynamodb-single-table" },
        localSecondaryIndexes: { type: "boolean" },
        gsiCount: { type: "integer", minimum: 1, maximum: 20 },
        removalPolicy: { type: "string", enum: ["destroy", "retain"] },
    },
    additionalProperties: false,
} as const;

type Configuration = FromSchema<typeof DATABASE_DEFINITION>;
const DATABASE_DEFAULTS: Required<Configuration> = {
    type: "database/dynamodb-single-table",
    localSecondaryIndexes: false,
    gsiCount: 0,
    removalPolicy: "retain",
};

export class DatabaseDynamoDBSingleTable extends AwsConstruct {
    public static type = "database/dynamodb-single-table";
    public static schema = DATABASE_DEFINITION;

    private readonly table: Table;
    private readonly tableNameOutput: CfnOutput;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id);

        const resolvedConfiguration = Object.assign({}, DATABASE_DEFAULTS, configuration);

        this.table = new Table(this, "Table", {
            partitionKey: { name: "PK", type: AttributeType.STRING },
            sortKey: { name: "SK", type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: true,
            timeToLiveAttribute: "TimeToLive",
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
            removalPolicy:
                resolvedConfiguration.removalPolicy === "destroy" ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
        });

        if (resolvedConfiguration.localSecondaryIndexes) {
            for (let localSecondaryIndex = 1; localSecondaryIndex <= 5; localSecondaryIndex++) {
                this.table.addLocalSecondaryIndex({
                    indexName: `LSI-${localSecondaryIndex}`,
                    sortKey: { name: `LSI-${localSecondaryIndex}-SK`, type: AttributeType.STRING },
                });
            }
        }

        if (resolvedConfiguration.gsiCount > 0) {
            for (
                let globalSecondaryIndex = 1;
                globalSecondaryIndex <= resolvedConfiguration.gsiCount;
                globalSecondaryIndex++
            ) {
                this.table.addGlobalSecondaryIndex({
                    indexName: `GSI-${globalSecondaryIndex}`,
                    partitionKey: { name: `GSI-${globalSecondaryIndex}-PK`, type: AttributeType.STRING },
                    sortKey: { name: `GSI-${globalSecondaryIndex}-SK`, type: AttributeType.STRING },
                });
            }
        }

        this.tableNameOutput = new CfnOutput(this, "TableName", {
            value: this.table.tableName,
        });
    }

    permissions(): PolicyStatement[] {
        return [
            new PolicyStatement(
                [
                    "dynamodb:GetItem",
                    "dynamodb:BatchGetItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:PutItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:BatchWriteItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:ConditionCheckItem",
                ],
                [this.table.tableArn, Stack.of(this).resolve(Fn.join("/", [this.table.tableArn, "index", "*"]))]
            ),
        ];
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            tableName: () => this.getTableName(),
        };
    }

    variables(): Record<string, unknown> {
        return {
            tableName: this.table.tableName,
            tableArn: this.table.tableArn,
            tableStreamArn: this.table.tableStreamArn,
        };
    }

    extend(): Record<string, CfnResource> {
        return {
            table: this.table.node.defaultChild as CfnTable,
        };
    }

    async getTableName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.tableNameOutput);
    }
}
