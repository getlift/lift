import { Construct as CdkConstruct, CfnOutput, Fn, Stack } from "@aws-cdk/core";
import { AttributeType, BillingMode, StreamViewType, Table } from "@aws-cdk/aws-dynamodb";
import { FromSchema } from "json-schema-to-ts";
import { AwsConstruct, AwsProvider } from "../classes";
import { PolicyStatement } from "../CloudFormation";

const DATABASE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "database/dynamodb-single-table" },
        gsiCount: { type: "integer", minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
} as const;

type Configuration = FromSchema<typeof DATABASE_DEFINITION>;

export class DatabaseDynamoDBSingleTable extends AwsConstruct {
    public static type = "database/dynamodb-single-table";
    public static schema = DATABASE_DEFINITION;

    private readonly table: Table;
    private readonly tableNameOutput: CfnOutput;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id);

        const resolvedConfiguration = Object.assign({}, configuration);

        this.table = new Table(this, "Table", {
            partitionKey: { name: "PK", type: AttributeType.STRING },
            sortKey: { name: "SK", type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: true,
            timeToLiveAttribute: "TimeToLive",
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
        });

        for (let localSecondaryIndex = 1; localSecondaryIndex <= 5; localSecondaryIndex++) {
            this.table.addLocalSecondaryIndex({
                indexName: `LSI-${localSecondaryIndex}`,
                sortKey: { name: `LSI-${localSecondaryIndex}-SK`, type: AttributeType.STRING },
            });
        }

        if (resolvedConfiguration.gsiCount !== undefined) {
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

    references(): Record<string, Record<string, unknown>> {
        return {
            tableName: this.referenceTableName(),
            tableStreamArn: this.referenceTableStreamArn(),
        };
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
                ],
                [
                    this.referenceTableArn(),
                    // @ts-expect-error join only accepts a list of strings, whereas other intrinsic functions are commonly accepted
                    Stack.of(this).resolve(Fn.join("/", [this.referenceTableArn(), "index", "*"])),
                ]
            ),
        ];
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            tableName: () => this.getTableName(),
        };
    }

    referenceTableName(): Record<string, unknown> {
        return this.provider.getCloudFormationReference(this.table.tableName);
    }

    referenceTableArn(): Record<string, unknown> {
        return this.provider.getCloudFormationReference(this.table.tableArn);
    }

    referenceTableStreamArn(): Record<string, unknown> {
        // @ts-expect-error tableStreamArn can be undefined for table without stream. Current table always has stream enabled
        return this.provider.getCloudFormationReference(this.table.tableStreamArn);
    }

    async getTableName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.tableNameOutput);
    }
}
