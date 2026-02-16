import type { Construct as CdkConstruct } from "constructs";
import type { CfnResource } from "aws-cdk-lib";
import { CfnOutput, Fn, Stack } from "aws-cdk-lib";
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
        gsis: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    index: {
                        enum: [
                            "GSI-1-PK",
                            "GSI-2-PK",
                            "GSI-3-PK",
                            "GSI-4-PK",
                            "GSI-5-PK",
                            "GSI-6-PK",
                            "GSI-7-PK",
                            "GSI-8-PK",
                            "GSI-9-PK",
                            "GSI-10-PK",
                            "GSI-11-PK",
                            "GSI-12-PK",
                            "GSI-13-PK",
                            "GSI-14-PK",
                            "GSI-15-PK",
                            "GSI-16-PK",
                            "GSI-17-PK",
                            "GSI-18-PK",
                            "GSI-19-PK",
                            "GSI-20-PK",
                            "GSI-1-SK",
                            "GSI-2-SK",
                            "GSI-3-SK",
                            "GSI-4-SK",
                            "GSI-5-SK",
                            "GSI-6-SK",
                            "GSI-7-SK",
                            "GSI-8-SK",
                            "GSI-9-SK",
                            "GSI-10-SK",
                            "GSI-11-SK",
                            "GSI-12-SK",
                            "GSI-13-SK",
                            "GSI-14-SK",
                            "GSI-15-SK",
                            "GSI-16-SK",
                            "GSI-17-SK",
                            "GSI-18-SK",
                            "GSI-19-SK",
                            "GSI-20-SK",
                        ],
                    },
                    name: { type: "string" },
                    type: { enum: ["string", "number"] },
                },
                required: ["index"],
                additionalProperties: false,
            },
        },
    },
    additionalProperties: false,
} as const;

type Configuration = FromSchema<typeof DATABASE_DEFINITION>;
const DATABASE_DEFAULTS: Required<Configuration> = {
    type: "database/dynamodb-single-table",
    localSecondaryIndexes: false,
    gsiCount: 0,
    gsis: [],
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
                const partitionKey = `GSI-${globalSecondaryIndex}-PK`;
                const partitionKeyMetadata = resolvedConfiguration.gsis.find((gsi) => gsi.index === partitionKey);
                const sortKey = `GSI-${globalSecondaryIndex}-SK`;
                const sortKeyMetadata = resolvedConfiguration.gsis.find((gsi) => gsi.index === sortKey);

                this.table.addGlobalSecondaryIndex({
                    indexName: `GSI-${globalSecondaryIndex}`,
                    partitionKey: {
                        name: partitionKeyMetadata?.name ?? partitionKey,
                        type: partitionKeyMetadata?.type === "number" ? AttributeType.NUMBER : AttributeType.STRING,
                    },
                    sortKey: {
                        name: sortKeyMetadata?.name ?? sortKey,
                        type: sortKeyMetadata?.type === "number" ? AttributeType.NUMBER : AttributeType.STRING,
                    },
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
