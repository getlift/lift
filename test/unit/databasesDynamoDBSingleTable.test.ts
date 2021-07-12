import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("databasesDynamoDBSingleTable", () => {
    describe("common tests", () => {
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
});
