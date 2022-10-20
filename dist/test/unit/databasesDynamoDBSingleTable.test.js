var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
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
var import_runServerless = __toModule(require("../utils/runServerless"));
describe("databasesDynamoDBSingleTable", () => {
  let cfTemplate;
  let computeLogicalId;
  const tableUseCases = [
    ["databaseWithoutSecondaryIndexes"],
    ["databaseWithLocalSecondaryIndexes"],
    ["databaseWithGlobalSecondaryIndexes"]
  ];
  beforeAll(async () => {
    ({ cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      fixture: "databasesDynamoDBSingleTable",
      configExt: import_runServerless.pluginConfigExt,
      command: "package"
    }));
  });
  describe("common tests", () => {
    test.each(tableUseCases)("%p - should ensure deletion policy and update replace policy are retain", (tableUseCase) => {
      expect(cfTemplate.Resources[computeLogicalId(tableUseCase, "Table")]).toMatchObject({
        UpdateReplacePolicy: "Retain",
        DeletionPolicy: "Retain"
      });
    });
    test.each(tableUseCases)("%p - should provision generic names for primary index", (tableUseCase) => {
      expect(cfTemplate.Resources[computeLogicalId(tableUseCase, "Table")].Properties.AttributeDefinitions).toContainEqual({ AttributeName: "PK", AttributeType: "S" });
      expect(cfTemplate.Resources[computeLogicalId(tableUseCase, "Table")].Properties.AttributeDefinitions).toContainEqual({ AttributeName: "SK", AttributeType: "S" });
      expect(cfTemplate.Resources[computeLogicalId(tableUseCase, "Table")].Properties.KeySchema).toEqual([
        {
          AttributeName: "PK",
          KeyType: "HASH"
        },
        {
          AttributeName: "SK",
          KeyType: "RANGE"
        }
      ]);
    });
  });
  it("should use generic names for LSI", () => {
    for (let localSecondaryIndex = 1; localSecondaryIndex <= 5; localSecondaryIndex++) {
      expect(cfTemplate.Resources[computeLogicalId("databaseWithLocalSecondaryIndexes", "Table")].Properties.AttributeDefinitions).toContainEqual({ AttributeName: `LSI-${localSecondaryIndex}-SK`, AttributeType: "S" });
    }
    expect(cfTemplate.Resources[computeLogicalId("databaseWithLocalSecondaryIndexes", "Table")].Properties.LocalSecondaryIndexes).toEqual(Array.from({ length: 5 }, (_, i) => i + 1).map((localSecondaryIndex) => {
      return {
        IndexName: `LSI-${localSecondaryIndex}`,
        KeySchema: [
          {
            AttributeName: "PK",
            KeyType: "HASH"
          },
          {
            AttributeName: `LSI-${localSecondaryIndex}-SK`,
            KeyType: "RANGE"
          }
        ],
        Projection: { ProjectionType: "ALL" }
      };
    }));
  });
  it("should use generic names for GSI", () => {
    for (let globalSecondaryIndex = 1; globalSecondaryIndex <= 2; globalSecondaryIndex++) {
      expect(cfTemplate.Resources[computeLogicalId("databaseWithGlobalSecondaryIndexes", "Table")].Properties.AttributeDefinitions).toContainEqual({ AttributeName: `GSI-${globalSecondaryIndex}-PK`, AttributeType: "S" });
      expect(cfTemplate.Resources[computeLogicalId("databaseWithGlobalSecondaryIndexes", "Table")].Properties.AttributeDefinitions).toContainEqual({ AttributeName: `GSI-${globalSecondaryIndex}-SK`, AttributeType: "S" });
    }
    expect(cfTemplate.Resources[computeLogicalId("databaseWithGlobalSecondaryIndexes", "Table")].Properties.GlobalSecondaryIndexes).toEqual(Array.from({ length: 2 }, (_, i) => i + 1).map((globalSecondaryIndex) => {
      return {
        IndexName: `GSI-${globalSecondaryIndex}`,
        KeySchema: [
          {
            AttributeName: `GSI-${globalSecondaryIndex}-PK`,
            KeyType: "HASH"
          },
          {
            AttributeName: `GSI-${globalSecondaryIndex}-SK`,
            KeyType: "RANGE"
          }
        ],
        Projection: { ProjectionType: "ALL" }
      };
    }));
  });
  it("allows overriding table properties", () => {
    expect(cfTemplate.Resources[computeLogicalId("extendedDatabase", "Table")].Properties).toMatchObject({
      TableClass: "STANDARD_INFREQUENT_ACCESS"
    });
  });
});
//# sourceMappingURL=databasesDynamoDBSingleTable.test.js.map
