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
var import_lodash = __toModule(require("lodash"));
var import_runServerless = __toModule(require("../utils/runServerless"));
function expectLiftStorageStatementIsAdded(cfTemplate) {
  expect((0, import_lodash.get)(cfTemplate.Resources.IamRoleLambdaExecution, "Properties.Policies[0].PolicyDocument.Statement")).toEqual(expect.arrayContaining([
    expect.objectContaining({
      Effect: "Allow",
      Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
    })
  ]));
}
function expectUserDynamoStatementIsAdded(cfTemplate) {
  expect((0, import_lodash.get)(cfTemplate.Resources.IamRoleLambdaExecution, "Properties.Policies[0].PolicyDocument.Statement")).toContainEqual({
    Effect: "Allow",
    Action: ["dynamodb:PutItem"],
    Resource: "arn:aws:dynamodb:us-east-1:123456789012:table/myDynamoDBTable"
  });
}
describe("permissions", () => {
  it("should not override user-defined role", async () => {
    const { cfTemplate } = await (0, import_runServerless.runServerless)({
      fixture: "permissions",
      configExt: (0, import_lodash.merge)({}, import_runServerless.pluginConfigExt, {
        provider: {
          iam: {
            role: "arn:aws:iam::123456789012:role/role"
          }
        }
      }),
      command: "package"
    });
    expect(cfTemplate.Resources.FooLambdaFunction).toMatchObject({
      Properties: {
        Role: "arn:aws:iam::123456789012:role/role"
      }
    });
  });
  it("should append permissions when using iam.role.statements", async () => {
    const { cfTemplate } = await (0, import_runServerless.runServerless)({
      fixture: "permissions",
      configExt: (0, import_lodash.merge)({}, import_runServerless.pluginConfigExt, {
        provider: {
          iam: {
            role: {
              statements: [
                {
                  Effect: "Allow",
                  Action: ["dynamodb:PutItem"],
                  Resource: "arn:aws:dynamodb:us-east-1:123456789012:table/myDynamoDBTable"
                }
              ]
            }
          }
        }
      }),
      command: "package"
    });
    expectUserDynamoStatementIsAdded(cfTemplate);
    expectLiftStorageStatementIsAdded(cfTemplate);
  });
  it("should append permissions when using the deprecated iamRoleStatements", async () => {
    const { cfTemplate } = await (0, import_runServerless.runServerless)({
      fixture: "permissions",
      configExt: (0, import_lodash.merge)({}, import_runServerless.pluginConfigExt, {
        provider: {
          iamRoleStatements: [
            {
              Effect: "Allow",
              Action: ["dynamodb:PutItem"],
              Resource: "arn:aws:dynamodb:us-east-1:123456789012:table/myDynamoDBTable"
            }
          ]
        }
      }),
      command: "package"
    });
    expectUserDynamoStatementIsAdded(cfTemplate);
    expectLiftStorageStatementIsAdded(cfTemplate);
  });
  it("should add permissions when no custom statements are provided", async () => {
    const { cfTemplate } = await (0, import_runServerless.runServerless)({
      fixture: "permissions",
      configExt: import_runServerless.pluginConfigExt,
      command: "package"
    });
    expectLiftStorageStatementIsAdded(cfTemplate);
  });
  it("should be possible to disable automatic permissions", async () => {
    const { cfTemplate } = await (0, import_runServerless.runServerless)({
      fixture: "permissions",
      configExt: (0, import_lodash.merge)({}, import_runServerless.pluginConfigExt, {
        lift: {
          automaticPermissions: false
        }
      }),
      command: "package"
    });
    expect((0, import_lodash.get)(cfTemplate.Resources.IamRoleLambdaExecution, "Properties.Policies[0].PolicyDocument.Statement")).toMatchObject([
      {
        Action: ["logs:CreateLogStream", "logs:CreateLogGroup"]
      },
      {
        Action: ["logs:PutLogEvents"]
      }
    ]);
  });
});
//# sourceMappingURL=permissions.test.js.map
