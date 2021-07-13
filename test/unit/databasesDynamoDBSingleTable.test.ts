import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("databasesDynamoDBSingleTable", () => {
    let cfTemplate: {
        Resources: Record<string, { Properties: Record<string, unknown> }>;
        Outputs: Record<string, unknown>;
    };
    let computeLogicalId: (...address: string[]) => string;
    const tableUseCases = [
        ["databaseWithoutSecondaryIndexes"],
        ["databaseWithLocalSecondaryIndexes"],
        ["databaseWithGlobalSecondaryIndexes"],
    ];

    beforeAll(async () => {
        ({ cfTemplate, computeLogicalId } = await runServerless({
            fixture: "databasesDynamoDBSingleTable",
            configExt: pluginConfigExt,
            command: "package",
        }));
    });
    describe("common tests", () => {
        test.each(tableUseCases)(
            "%p - should ensure deletion policy and update replace policy are retain",
            (tableUseCase) => {
                expect(cfTemplate.Resources[computeLogicalId(tableUseCase, "Table")]).toMatchObject({
                    UpdateReplacePolicy: "Retain",
                    DeletionPolicy: "Retain",
                });
            }
        );
        test.each(tableUseCases)("%p - should provision generic names for primary index", (tableUseCase) => {
            expect(
                cfTemplate.Resources[computeLogicalId(tableUseCase, "Table")].Properties.AttributeDefinitions
            ).toContainEqual({ AttributeName: "PK", AttributeType: "S" });
            expect(
                cfTemplate.Resources[computeLogicalId(tableUseCase, "Table")].Properties.AttributeDefinitions
            ).toContainEqual({ AttributeName: "SK", AttributeType: "S" });
            expect(cfTemplate.Resources[computeLogicalId(tableUseCase, "Table")].Properties.KeySchema).toEqual([
                {
                    AttributeName: "PK",
                    KeyType: "HASH",
                },
                {
                    AttributeName: "SK",
                    KeyType: "RANGE",
                },
            ]);
        });
    });
    it("should use generic names for LSI", () => {
        for (let localSecondaryIndex = 1; localSecondaryIndex <= 5; localSecondaryIndex++) {
            expect(
                cfTemplate.Resources[computeLogicalId("databaseWithLocalSecondaryIndexes", "Table")].Properties
                    .AttributeDefinitions
            ).toContainEqual({ AttributeName: `LSI-${localSecondaryIndex}-SK`, AttributeType: "S" });
        }
        expect(
            cfTemplate.Resources[computeLogicalId("databaseWithLocalSecondaryIndexes", "Table")].Properties
                .LocalSecondaryIndexes
        ).toEqual(
            Array.from({ length: 5 }, (_, i) => i + 1).map((localSecondaryIndex) => {
                return {
                    IndexName: `LSI-${localSecondaryIndex}`,
                    KeySchema: [
                        {
                            AttributeName: "PK",
                            KeyType: "HASH",
                        },
                        {
                            AttributeName: `LSI-${localSecondaryIndex}-SK`,
                            KeyType: "RANGE",
                        },
                    ],
                    Projection: { ProjectionType: "ALL" },
                };
            })
        );
    });
    it("should use generic names for GSI", () => {
        for (let globalSecondaryIndex = 1; globalSecondaryIndex <= 2; globalSecondaryIndex++) {
            expect(
                cfTemplate.Resources[computeLogicalId("databaseWithGlobalSecondaryIndexes", "Table")].Properties
                    .AttributeDefinitions
            ).toContainEqual({ AttributeName: `GSI-${globalSecondaryIndex}-PK`, AttributeType: "S" });
            expect(
                cfTemplate.Resources[computeLogicalId("databaseWithGlobalSecondaryIndexes", "Table")].Properties
                    .AttributeDefinitions
            ).toContainEqual({ AttributeName: `GSI-${globalSecondaryIndex}-SK`, AttributeType: "S" });
        }
        expect(
            cfTemplate.Resources[computeLogicalId("databaseWithGlobalSecondaryIndexes", "Table")].Properties
                .GlobalSecondaryIndexes
        ).toEqual(
            Array.from({ length: 2 }, (_, i) => i + 1).map((globalSecondaryIndex) => {
                return {
                    IndexName: `GSI-${globalSecondaryIndex}`,
                    KeySchema: [
                        {
                            AttributeName: `GSI-${globalSecondaryIndex}-PK`,
                            KeyType: "HASH",
                        },
                        {
                            AttributeName: `GSI-${globalSecondaryIndex}-SK`,
                            KeyType: "RANGE",
                        },
                    ],
                    Projection: { ProjectionType: "ALL" },
                };
            })
        );
    });
});
