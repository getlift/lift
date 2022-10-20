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
var sinon = __toModule(require("sinon"));
var import_runServerless = __toModule(require("../utils/runServerless"));
describe("single page app", () => {
  afterEach(() => {
    sinon.restore();
  });
  it("should define a request function that redirects nested uris to index.html", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "single-page-app",
            path: ".",
            domain: ["www.example.com", "example.com"],
            certificate: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123"
          }
        }
      })
    });
    const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
    const requestFunction = computeLogicalId("landing", "RequestFunction");
    const responseFunction = computeLogicalId("landing", "ResponseFunction");
    expect(cfTemplate.Resources[requestFunction]).toMatchInlineSnapshot(`
            Object {
              "Properties": Object {
                "AutoPublish": true,
                "FunctionCode": "var REDIRECT_REGEX = /^[^.]+$|\\\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|xml|pdf)$)([^.]+$)/;

            function handler(event) {
                var uri = event.request.uri;
                var request = event.request;
                var isUriToRedirect = REDIRECT_REGEX.test(uri);

                if (isUriToRedirect) {
                    request.uri = \\"/index.html\\";
                }

                return event.request;
            }",
                "FunctionConfig": Object {
                  "Comment": "app-dev-us-east-1-landing-request",
                  "Runtime": "cloudfront-js-1.0",
                },
                "Name": "app-dev-us-east-1-landing-request",
              },
              "Type": "AWS::CloudFront::Function",
            }
        `);
    expect((0, import_lodash.get)(cfTemplate.Resources[cfDistributionLogicalId], "Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations")).toMatchInlineSnapshot(`
            Array [
              Object {
                "EventType": "viewer-response",
                "FunctionARN": Object {
                  "Fn::GetAtt": Array [
                    "${responseFunction}",
                    "FunctionARN",
                  ],
                },
              },
              Object {
                "EventType": "viewer-request",
                "FunctionARN": Object {
                  "Fn::GetAtt": Array [
                    "${requestFunction}",
                    "FunctionARN",
                  ],
                },
              },
            ]
        `);
  });
  it("should allow to redirect to the main domain", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "single-page-app",
            path: ".",
            domain: ["www.example.com", "example.com"],
            certificate: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
            redirectToMainDomain: true
          }
        }
      })
    });
    const requestFunction = computeLogicalId("landing", "RequestFunction");
    expect(cfTemplate.Resources[requestFunction].Properties.FunctionCode).toMatchInlineSnapshot(`
            "var REDIRECT_REGEX = /^[^.]+$|\\\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|xml|pdf)$)([^.]+$)/;

            function handler(event) {
                var uri = event.request.uri;
                var request = event.request;
                var isUriToRedirect = REDIRECT_REGEX.test(uri);

                if (isUriToRedirect) {
                    request.uri = \\"/index.html\\";
                }
                if (request.headers[\\"host\\"].value !== \\"www.example.com\\") {
                    return {
                        statusCode: 301,
                        statusDescription: \\"Moved Permanently\\",
                        headers: {
                            location: {
                                value: \\"https://www.example.com\\" + request.uri
                            }
                        }
                    };
                }

                return event.request;
            }"
        `);
  });
  it("allows overriding single page app properties", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "single-page-app",
            path: ".",
            extensions: {
              distribution: {
                Properties: {
                  DistributionConfig: {
                    Comment: "This is my comment"
                  }
                }
              },
              bucket: {
                Properties: {
                  ObjectLockEnabled: true
                }
              }
            }
          }
        }
      })
    });
    expect(cfTemplate.Resources[computeLogicalId("landing", "CDN")].Properties).toMatchObject({
      DistributionConfig: {
        Comment: "This is my comment"
      }
    });
    expect(cfTemplate.Resources[computeLogicalId("landing", "Bucket")].Properties).toMatchObject({
      ObjectLockEnabled: true
    });
  });
  it("trims CloudFront function names to stay under the limit", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      options: {
        stage: "super-long-stage-name"
      },
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          "suuuper-long-construct-name": {
            type: "single-page-app",
            path: "."
          }
        }
      })
    });
    expect(cfTemplate.Resources[computeLogicalId("suuuper-long-construct-name", "RequestFunction")]).toMatchObject({
      Type: "AWS::CloudFront::Function",
      Properties: {
        Name: "app-super-long-stage-name-us-east-1-suuuper-long-construc-f3b7e1"
      }
    });
    expect(cfTemplate.Resources[computeLogicalId("suuuper-long-construct-name", "ResponseFunction")]).toMatchObject({
      Type: "AWS::CloudFront::Function",
      Properties: {
        Name: "app-super-long-stage-name-us-east-1-suuuper-long-construc-8c1f76"
      }
    });
  });
});
//# sourceMappingURL=singlePageApp.test.js.map
