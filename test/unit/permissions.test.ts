import { get, merge } from "lodash";
import { pluginConfigExt, runServerless } from "../utils/runServerless";

type CfTemplate = {
    Resources: Record<string, unknown>;
    Outputs?: Record<string, unknown>;
};

function expectLiftStorageStatementIsAdded(cfTemplate: CfTemplate) {
    expect(get(cfTemplate.Resources.IamRoleLambdaExecution, "Properties.Policies[0].PolicyDocument.Statement")).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                Effect: "Allow",
                Action: [
                    "s3:PutObject",
                    "s3:GetObject",
                    "s3:DeleteObject",
                    "s3:ListBucket",
                    "s3:GetObjectAcl",
                    "s3:PutObjectAcl",
                ],
            }),
        ])
    );
}

function expectUserDynamoStatementIsAdded(cfTemplate: CfTemplate) {
    expect(
        get(cfTemplate.Resources.IamRoleLambdaExecution, "Properties.Policies[0].PolicyDocument.Statement")
    ).toContainEqual({
        Effect: "Allow",
        Action: ["dynamodb:PutItem"],
        Resource: "arn:aws:dynamodb:us-east-1:123456789012:table/myDynamoDBTable",
    });
}

describe("permissions", () => {
    it("should not override user-defined role", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "permissions",
            configExt: merge({}, pluginConfigExt, {
                provider: {
                    iam: {
                        role: "arn:aws:iam::123456789012:role/role",
                    },
                },
            }),
            command: "package",
        });
        expect(cfTemplate.Resources.FooLambdaFunction).toMatchObject({
            Properties: {
                Role: "arn:aws:iam::123456789012:role/role",
            },
        });
    });

    it("should append permissions when using iam.role.statements", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "permissions",
            configExt: merge({}, pluginConfigExt, {
                provider: {
                    iam: {
                        role: {
                            statements: [
                                {
                                    Effect: "Allow",
                                    Action: ["dynamodb:PutItem"],
                                    Resource: "arn:aws:dynamodb:us-east-1:123456789012:table/myDynamoDBTable",
                                },
                            ],
                        },
                    },
                },
            }),
            command: "package",
        });

        expectUserDynamoStatementIsAdded(cfTemplate);
        expectLiftStorageStatementIsAdded(cfTemplate);
    });

    it("should append permissions when using the deprecated iamRoleStatements", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "permissions",
            configExt: merge({}, pluginConfigExt, {
                provider: {
                    iamRoleStatements: [
                        {
                            Effect: "Allow",
                            Action: ["dynamodb:PutItem"],
                            Resource: "arn:aws:dynamodb:us-east-1:123456789012:table/myDynamoDBTable",
                        },
                    ],
                },
            }),
            command: "package",
        });

        expectUserDynamoStatementIsAdded(cfTemplate);
        expectLiftStorageStatementIsAdded(cfTemplate);
    });

    it("should add permissions when no custom statements are provided", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "permissions",
            configExt: pluginConfigExt,
            command: "package",
        });

        expectLiftStorageStatementIsAdded(cfTemplate);
    });

    it("should not include ACL permissions when allowAcl is not set", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "permissions",
            configExt: pluginConfigExt,
            command: "package",
        });
        const statements = get(
            cfTemplate.Resources.IamRoleLambdaExecution,
            "Properties.Policies[0].PolicyDocument.Statement"
        ) as unknown as { Action: string[] }[];
        // testStorageNoAcl should produce a statement without ACL permissions
        expect(statements).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    Effect: "Allow",
                    Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
                }),
            ])
        );
    });

    it("should be possible to disable automatic permissions", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "permissions",
            configExt: merge({}, pluginConfigExt, {
                // We disable automatic permissions
                lift: {
                    automaticPermissions: false,
                },
            }),
            command: "package",
        });
        // There should be no "s3:*" permissions added
        const statements = get(
            cfTemplate.Resources.IamRoleLambdaExecution,
            "Properties.Policies[0].PolicyDocument.Statement"
        ) as unknown as { Action: string[] }[];
        statements.forEach(({ Action }) => {
            expect(Action).not.toEqual(expect.arrayContaining([expect.stringMatching(/^s3:.*$/)]));
        });
    });
});
