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
var sinon = __toModule(require("sinon"));
var fs = __toModule(require("fs"));
var path = __toModule(require("path"));
var import_lodash = __toModule(require("lodash"));
var import_runServerless = __toModule(require("../utils/runServerless"));
var CloudFormationHelpers = __toModule(require("../../src/CloudFormation"));
var import_s3_sync = __toModule(require("../../src/utils/s3-sync"));
var import_mockAws = __toModule(require("../utils/mockAws"));
describe("static websites", () => {
  afterEach(() => {
    sinon.restore();
  });
  it("should create all required resources", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "static-website",
            path: "."
          }
        }
      })
    });
    const bucketLogicalId = computeLogicalId("landing", "Bucket");
    const bucketPolicyLogicalId = computeLogicalId("landing", "Bucket", "Policy");
    const responseFunction = computeLogicalId("landing", "ResponseFunction");
    const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
    const cfOriginId = computeLogicalId("landing", "CDN", "Origin1");
    expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
      "ServerlessDeploymentBucket",
      "ServerlessDeploymentBucketPolicy",
      bucketLogicalId,
      bucketPolicyLogicalId,
      responseFunction,
      cfDistributionLogicalId
    ]);
    expect(cfTemplate.Resources[bucketLogicalId]).toStrictEqual({
      Type: "AWS::S3::Bucket",
      UpdateReplacePolicy: "Delete",
      DeletionPolicy: "Delete",
      Properties: {
        WebsiteConfiguration: {
          IndexDocument: "index.html"
        }
      }
    });
    expect(cfTemplate.Resources[bucketPolicyLogicalId]).toStrictEqual({
      Type: "AWS::S3::BucketPolicy",
      Properties: {
        Bucket: {
          Ref: bucketLogicalId
        },
        PolicyDocument: {
          Statement: [
            {
              Action: "s3:GetObject",
              Effect: "Allow",
              Principal: {
                AWS: "*"
              },
              Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/*"]] }
            }
          ],
          Version: "2012-10-17"
        }
      }
    });
    expect(cfTemplate.Resources[cfDistributionLogicalId]).toStrictEqual({
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Comment: "app-dev landing website CDN",
          CustomErrorResponses: [
            {
              ErrorCachingMinTTL: 0,
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: "/index.html"
            }
          ],
          DefaultCacheBehavior: {
            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
            Compress: true,
            TargetOriginId: cfOriginId,
            ViewerProtocolPolicy: "redirect-to-https",
            FunctionAssociations: [
              {
                EventType: "viewer-response",
                FunctionARN: {
                  "Fn::GetAtt": [responseFunction, "FunctionARN"]
                }
              }
            ]
          },
          DefaultRootObject: "index.html",
          Enabled: true,
          HttpVersion: "http2",
          IPV6Enabled: true,
          Origins: [
            {
              CustomOriginConfig: {
                OriginProtocolPolicy: "http-only",
                OriginSSLProtocols: ["TLSv1.2"]
              },
              DomainName: {
                "Fn::Select": [
                  2,
                  {
                    "Fn::Split": [
                      "/",
                      {
                        "Fn::GetAtt": [bucketLogicalId, "WebsiteURL"]
                      }
                    ]
                  }
                ]
              },
              Id: cfOriginId
            }
          ]
        }
      }
    });
    expect(cfTemplate.Outputs).toMatchObject({
      [computeLogicalId("landing", "BucketName")]: {
        Description: "Name of the bucket that stores the static website.",
        Value: {
          Ref: bucketLogicalId
        }
      },
      [computeLogicalId("landing", "Domain")]: {
        Description: "Website domain name.",
        Value: {
          "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"]
        }
      },
      [computeLogicalId("landing", "CloudFrontCName")]: {
        Description: "CloudFront CNAME.",
        Value: {
          "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"]
        }
      },
      [computeLogicalId("landing", "DistributionId")]: {
        Description: "ID of the CloudFront distribution.",
        Value: {
          Ref: cfDistributionLogicalId
        }
      }
    });
    expect(cfTemplate.Resources[responseFunction]).toStrictEqual({
      Type: "AWS::CloudFront::Function",
      Properties: {
        AutoPublish: true,
        FunctionConfig: {
          Comment: "app-dev-us-east-1-landing-response",
          Runtime: "cloudfront-js-1.0"
        },
        FunctionCode: `function handler(event) {
    var response = event.response;
    response.headers = Object.assign({}, {
    "x-frame-options": {
        "value": "SAMEORIGIN"
    },
    "x-content-type-options": {
        "value": "nosniff"
    },
    "x-xss-protection": {
        "value": "1; mode=block"
    },
    "strict-transport-security": {
        "value": "max-age=63072000"
    }
}, response.headers);
    return response;
}`,
        Name: "app-dev-us-east-1-landing-response"
      }
    });
  });
  it("should support a custom domain", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "static-website",
            path: ".",
            domain: "example.com",
            certificate: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123"
          }
        }
      })
    });
    const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
    expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Aliases: ["example.com"],
          ViewerCertificate: {
            AcmCertificateArn: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
            MinimumProtocolVersion: "TLSv1.2_2021",
            SslSupportMethod: "sni-only"
          }
        }
      }
    });
    expect(cfTemplate.Outputs).toMatchObject({
      [computeLogicalId("landing", "Domain")]: {
        Description: "Website domain name.",
        Value: "example.com"
      },
      [computeLogicalId("landing", "CloudFrontCName")]: {
        Description: "CloudFront CNAME.",
        Value: {
          "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"]
        }
      }
    });
  });
  it("should support multiple custom domains", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "static-website",
            path: ".",
            domain: ["example.com", "www.example.com"],
            certificate: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123"
          }
        }
      })
    });
    const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
    expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Aliases: ["example.com", "www.example.com"]
        }
      }
    });
    expect(cfTemplate.Outputs).toMatchObject({
      [computeLogicalId("landing", "Domain")]: {
        Description: "Website domain name.",
        Value: "example.com"
      },
      [computeLogicalId("landing", "CloudFrontCName")]: {
        Description: "CloudFront CNAME.",
        Value: {
          "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"]
        }
      }
    });
  });
  it("should allow to customize security HTTP headers", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "static-website",
            path: ".",
            security: {
              allowIframe: true
            }
          }
        }
      })
    });
    const edgeFunction = computeLogicalId("landing", "ResponseFunction");
    expect(cfTemplate.Resources[edgeFunction]).toStrictEqual({
      Type: "AWS::CloudFront::Function",
      Properties: {
        AutoPublish: true,
        FunctionCode: `function handler(event) {
    var response = event.response;
    response.headers = Object.assign({}, {
    "x-content-type-options": {
        "value": "nosniff"
    },
    "x-xss-protection": {
        "value": "1; mode=block"
    },
    "strict-transport-security": {
        "value": "max-age=63072000"
    }
}, response.headers);
    return response;
}`,
        FunctionConfig: {
          Comment: "app-dev-us-east-1-landing-response",
          Runtime: "cloudfront-js-1.0"
        },
        Name: "app-dev-us-east-1-landing-response"
      }
    });
  });
  it("should allow to redirect to the main domain", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "static-website",
            path: ".",
            domain: ["www.example.com", "example.com"],
            certificate: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
            redirectToMainDomain: true
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
                "FunctionCode": "function handler(event) {
                var request = event.request;
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
                return request;
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
  it("should allow to customize the error page", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "static-website",
            path: ".",
            errorPage: "my/custom/error.html"
          }
        }
      })
    });
    const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
    const bucketLogicalId = computeLogicalId("landing", "Bucket");
    const responseFunction = computeLogicalId("landing", "ResponseFunction");
    const cfOriginId = computeLogicalId("landing", "CDN", "Origin1");
    expect(cfTemplate.Resources[cfDistributionLogicalId]).toStrictEqual({
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Comment: "app-dev landing website CDN",
          CustomErrorResponses: [
            {
              ErrorCachingMinTTL: 0,
              ErrorCode: 404,
              ResponseCode: 404,
              ResponsePagePath: "/my/custom/error.html"
            }
          ],
          DefaultCacheBehavior: {
            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
            Compress: true,
            TargetOriginId: cfOriginId,
            ViewerProtocolPolicy: "redirect-to-https",
            FunctionAssociations: [
              {
                EventType: "viewer-response",
                FunctionARN: {
                  "Fn::GetAtt": [responseFunction, "FunctionARN"]
                }
              }
            ]
          },
          DefaultRootObject: "index.html",
          Enabled: true,
          HttpVersion: "http2",
          IPV6Enabled: true,
          Origins: [
            {
              CustomOriginConfig: {
                OriginProtocolPolicy: "http-only",
                OriginSSLProtocols: ["TLSv1.2"]
              },
              DomainName: {
                "Fn::Select": [
                  2,
                  {
                    "Fn::Split": [
                      "/",
                      {
                        "Fn::GetAtt": [bucketLogicalId, "WebsiteURL"]
                      }
                    ]
                  }
                ]
              },
              Id: cfOriginId
            }
          ]
        }
      }
    });
  });
  it("should validate the error page path", async () => {
    await expect(() => {
      return (0, import_runServerless.runServerless)({
        command: "package",
        config: Object.assign(import_runServerless.baseConfig, {
          constructs: {
            landing: {
              type: "static-website",
              path: ".",
              errorPage: "./error.html"
            }
          }
        })
      });
    }).rejects.toThrowError("The 'errorPage' option of the 'landing' static website cannot start with './' or '../'. (it cannot be a relative path).");
    await expect(() => {
      return (0, import_runServerless.runServerless)({
        command: "package",
        config: Object.assign(import_runServerless.baseConfig, {
          constructs: {
            landing: {
              type: "static-website",
              path: ".",
              errorPage: "../error.html"
            }
          }
        })
      });
    }).rejects.toThrowError("The 'errorPage' option of the 'landing' static website cannot start with './' or '../'. (it cannot be a relative path).");
  });
  it("should synchronize files to S3", async () => {
    const awsMock = (0, import_mockAws.mockAws)();
    sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("bucket-name");
    awsMock.mockService("S3", "listObjectsV2").resolves({
      IsTruncated: false,
      Contents: [
        {
          Key: "index.html",
          ETag: (0, import_s3_sync.computeS3ETag)(fs.readFileSync(path.join(__dirname, "../fixtures/staticWebsites/public/index.html")))
        },
        { Key: "styles.css" },
        { Key: "image.jpg" }
      ]
    });
    const putObjectSpy = awsMock.mockService("S3", "putObject");
    const deleteObjectsSpy = awsMock.mockService("S3", "deleteObjects").resolves({
      Deleted: [
        {
          Key: "image.jpg"
        }
      ]
    });
    const cloudfrontInvalidationSpy = awsMock.mockService("CloudFront", "createInvalidation");
    await (0, import_runServerless.runServerless)({
      fixture: "staticWebsites",
      configExt: import_runServerless.pluginConfigExt,
      command: "landing:upload"
    });
    sinon.assert.callCount(putObjectSpy, 2);
    expect(putObjectSpy.firstCall.firstArg).toEqual({
      Bucket: "bucket-name",
      Key: "scripts.js",
      Body: fs.readFileSync(path.join(__dirname, "../fixtures/staticWebsites/public/scripts.js")),
      ContentType: "application/javascript"
    });
    expect(putObjectSpy.secondCall.firstArg).toEqual({
      Bucket: "bucket-name",
      Key: "styles.css",
      Body: fs.readFileSync(path.join(__dirname, "../fixtures/staticWebsites/public/styles.css")),
      ContentType: "text/css"
    });
    sinon.assert.calledOnce(deleteObjectsSpy);
    expect(deleteObjectsSpy.firstCall.firstArg).toEqual({
      Bucket: "bucket-name",
      Delete: {
        Objects: [
          {
            Key: "image.jpg"
          }
        ]
      }
    });
    sinon.assert.calledOnce(cloudfrontInvalidationSpy);
  });
  it("allows overriding static website properties", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          landing: {
            type: "static-website",
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
            type: "static-website",
            path: ".",
            domain: ["foo.com", "bar.com"],
            certificate: "arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234",
            redirectToMainDomain: true
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
//# sourceMappingURL=staticWebsite.test.js.map
