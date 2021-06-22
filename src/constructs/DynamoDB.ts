import { Construct as CdkConstruct, CfnOutput, Fn } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { AttributeType, BillingMode, Table } from "@aws-cdk/aws-dynamodb";
import { AwsConstruct, AwsProvider } from "../classes";
import { PolicyStatement } from "../CloudFormation";

const SCHEMA = {
    type: "object",
    properties: {
        partitionKey: {
            type: "object",
            properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["B", "N", "S", "binary", "number", "string"] },
            },
            additionalProperties: false,
            required: ["name", "type"],
        },
        sortKey: {
            type: "object",
            properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["B", "N", "S", "binary", "number", "string"] },
            },
            additionalProperties: false,
            required: ["name", "type"],
        },
    },
    additionalProperties: false,
    required: ["partitionKey"],
} as const;
type Configuration = FromSchema<typeof SCHEMA>;
type LiftAttributeType = "B" | "N" | "S" | "binary" | "number" | "string";

export class DynamoDB extends AwsConstruct {
    public static type = "dynamodb";
    public static schema = SCHEMA;

    private readonly table: Table;
    private readonly tableNameOutput: CfnOutput;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id);

        this.table = new Table(this, "Table", {
            tableName: `${this.provider.stackName}-${id}`,
            billingMode: BillingMode.PAY_PER_REQUEST,
            partitionKey: {
                name: configuration.partitionKey.name,
                type: this.normalizeType(configuration.partitionKey.type),
            },
            sortKey: configuration.sortKey
                ? {
                      name: configuration.sortKey.name,
                      type: this.normalizeType(configuration.sortKey.type),
                  }
                : undefined,
            pointInTimeRecovery: true,
        });

        this.tableNameOutput = new CfnOutput(this, "TableName", {
            value: this.table.tableName,
        });
    }

    references(): Record<string, Record<string, unknown>> {
        return {
            tableArn: this.referenceTableArn(),
            tableName: this.provider.getCloudFormationReference(this.table.tableName),
        };
    }

    permissions(): PolicyStatement[] {
        return [
            new PolicyStatement(
                ["dynamodb:*"],
                [
                    this.referenceTableArn(),
                    // Also allows access to secondary indexes
                    this.provider.getCloudFormationReference(Fn.join("", [this.table.tableArn, "/*"])),
                ]
            ),
        ];
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            bucketName: () => this.getBucketName(),
        };
    }

    commands(): Record<string, () => void | Promise<void>> {
        return {};
    }

    private referenceTableArn(): Record<string, unknown> {
        return this.provider.getCloudFormationReference(this.table.tableArn);
    }

    private async getBucketName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.tableNameOutput);
    }

    private normalizeType(type: LiftAttributeType): AttributeType {
        switch (type) {
            case "B":
            case "binary":
                return AttributeType.BINARY;
            case "S":
            case "string":
                return AttributeType.STRING;
            case "N":
            case "number":
                return AttributeType.NUMBER;
        }
    }
}
