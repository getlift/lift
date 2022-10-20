var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __reExport = (target, module2, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && key !== "default")
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toModule = (module2) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", module2 && module2.__esModule && "default" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
};
__export(exports, {
  DatabaseDynamoDBSingleTable: () => DatabaseDynamoDBSingleTable
});
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_aws_dynamodb = __toModule(require("aws-cdk-lib/aws-dynamodb"));
var import_abstracts = __toModule(require("@lift/constructs/abstracts"));
var import_CloudFormation = __toModule(require("../../CloudFormation"));
const DATABASE_DEFINITION = {
  type: "object",
  properties: {
    type: { const: "database/dynamodb-single-table" },
    localSecondaryIndexes: { type: "boolean" },
    gsiCount: { type: "integer", minimum: 1, maximum: 20 }
  },
  additionalProperties: false
};
const DATABASE_DEFAULTS = {
  type: "database/dynamodb-single-table",
  localSecondaryIndexes: false,
  gsiCount: 0
};
class DatabaseDynamoDBSingleTable extends import_abstracts.AwsConstruct {
  constructor(scope, id, configuration, provider) {
    super(scope, id);
    this.provider = provider;
    const resolvedConfiguration = Object.assign({}, DATABASE_DEFAULTS, configuration);
    this.table = new import_aws_dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: import_aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: import_aws_dynamodb.AttributeType.STRING },
      billingMode: import_aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: "TimeToLive",
      stream: import_aws_dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    });
    if (resolvedConfiguration.localSecondaryIndexes) {
      for (let localSecondaryIndex = 1; localSecondaryIndex <= 5; localSecondaryIndex++) {
        this.table.addLocalSecondaryIndex({
          indexName: `LSI-${localSecondaryIndex}`,
          sortKey: { name: `LSI-${localSecondaryIndex}-SK`, type: import_aws_dynamodb.AttributeType.STRING }
        });
      }
    }
    if (resolvedConfiguration.gsiCount > 0) {
      for (let globalSecondaryIndex = 1; globalSecondaryIndex <= resolvedConfiguration.gsiCount; globalSecondaryIndex++) {
        this.table.addGlobalSecondaryIndex({
          indexName: `GSI-${globalSecondaryIndex}`,
          partitionKey: { name: `GSI-${globalSecondaryIndex}-PK`, type: import_aws_dynamodb.AttributeType.STRING },
          sortKey: { name: `GSI-${globalSecondaryIndex}-SK`, type: import_aws_dynamodb.AttributeType.STRING }
        });
      }
    }
    this.tableNameOutput = new import_aws_cdk_lib.CfnOutput(this, "TableName", {
      value: this.table.tableName
    });
  }
  permissions() {
    return [
      new import_CloudFormation.PolicyStatement([
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:UpdateItem"
      ], [this.table.tableArn, import_aws_cdk_lib.Stack.of(this).resolve(import_aws_cdk_lib.Fn.join("/", [this.table.tableArn, "index", "*"]))])
    ];
  }
  outputs() {
    return {
      tableName: () => this.getTableName()
    };
  }
  variables() {
    return {
      tableName: this.table.tableName,
      tableArn: this.table.tableArn,
      tableStreamArn: this.table.tableStreamArn
    };
  }
  extend() {
    return {
      table: this.table.node.defaultChild
    };
  }
  async getTableName() {
    return this.provider.getStackOutput(this.tableNameOutput);
  }
}
DatabaseDynamoDBSingleTable.type = "database/dynamodb-single-table";
DatabaseDynamoDBSingleTable.schema = DATABASE_DEFINITION;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DatabaseDynamoDBSingleTable
});
//# sourceMappingURL=DatabaseDynamoDBSingleTable.js.map
