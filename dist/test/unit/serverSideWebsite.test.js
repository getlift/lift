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
var import_runServerless = __toModule(require("../utils/runServerless"));
var CloudFormationHelpers = __toModule(require("../../src/CloudFormation"));
var import_s3_sync = __toModule(require("../../src/utils/s3-sync"));
var import_mockAws = __toModule(require("../utils/mockAws"));
describe("server-side website", () => {
  afterEach(() => {
    sinon.restore();
  });
  it("should create all required resources", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website",
            assets: {
              "/assets/*": "public"
            }
          }
        }
      })
    });
    const bucketLogicalId = computeLogicalId("backend", "Assets");
    const bucketPolicyLogicalId = computeLogicalId("backend", "Assets", "Policy");
    const originAccessIdentityLogicalId = computeLogicalId("backend", "CDN", "Origin2", "S3Origin");
    const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
    const cfOriginId1 = computeLogicalId("backend", "CDN", "Origin1");
    const cfOriginId2 = computeLogicalId("backend", "CDN", "Origin2");
    const originPolicyId = computeLogicalId("backend", "BackendOriginPolicy");
    const cachePolicyId = computeLogicalId("backend", "BackendCachePolicy");
    const requestFunction = computeLogicalId("backend", "RequestFunction");
    expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
      "ServerlessDeploymentBucket",
      "ServerlessDeploymentBucketPolicy",
      bucketLogicalId,
      bucketPolicyLogicalId,
      originPolicyId,
      cachePolicyId,
      requestFunction,
      originAccessIdentityLogicalId,
      cfDistributionLogicalId
    ]);
    expect(cfTemplate.Resources[bucketLogicalId]).toMatchObject({
      Type: "AWS::S3::Bucket",
      UpdateReplacePolicy: "Delete",
      DeletionPolicy: "Delete"
    });
    expect(cfTemplate.Resources[bucketPolicyLogicalId]).toMatchObject({
      Properties: {
        Bucket: { Ref: bucketLogicalId },
        PolicyDocument: {
          Statement: [
            {
              Action: "s3:GetObject",
              Effect: "Allow",
              Principal: {
                CanonicalUser: { "Fn::GetAtt": [originAccessIdentityLogicalId, "S3CanonicalUserId"] }
              },
              Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketLogicalId, "Arn"] }, "/*"]] }
            }
          ],
          Version: "2012-10-17"
        }
      }
    });
    expect(cfTemplate.Resources[originAccessIdentityLogicalId]).toStrictEqual({
      Type: "AWS::CloudFront::CloudFrontOriginAccessIdentity",
      Properties: {
        CloudFrontOriginAccessIdentityConfig: {
          Comment: `Identity for ${cfOriginId2}`
        }
      }
    });
    expect(cfTemplate.Resources[cfDistributionLogicalId]).toStrictEqual({
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Comment: "app-dev backend website CDN",
          CustomErrorResponses: [
            { ErrorCachingMinTTL: 0, ErrorCode: 500 },
            { ErrorCachingMinTTL: 0, ErrorCode: 504 }
          ],
          DefaultCacheBehavior: {
            AllowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
            Compress: true,
            CachePolicyId: { Ref: cachePolicyId },
            OriginRequestPolicyId: { Ref: originPolicyId },
            TargetOriginId: cfOriginId1,
            ViewerProtocolPolicy: "redirect-to-https",
            FunctionAssociations: [
              {
                EventType: "viewer-request",
                FunctionARN: {
                  "Fn::GetAtt": [requestFunction, "FunctionARN"]
                }
              }
            ]
          },
          CacheBehaviors: [
            {
              AllowedMethods: ["GET", "HEAD", "OPTIONS"],
              CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
              Compress: true,
              PathPattern: "/assets/*",
              TargetOriginId: cfOriginId2,
              ViewerProtocolPolicy: "redirect-to-https"
            }
          ],
          Enabled: true,
          HttpVersion: "http2",
          IPV6Enabled: true,
          Origins: [
            {
              Id: cfOriginId1,
              CustomOriginConfig: {
                OriginProtocolPolicy: "https-only",
                OriginSSLProtocols: ["TLSv1.2"]
              },
              DomainName: {
                "Fn::Join": [".", [{ Ref: "HttpApi" }, "execute-api.us-east-1.amazonaws.com"]]
              }
            },
            {
              DomainName: { "Fn::GetAtt": [bucketLogicalId, "RegionalDomainName"] },
              Id: cfOriginId2,
              S3OriginConfig: {
                OriginAccessIdentity: {
                  "Fn::Join": [
                    "",
                    ["origin-access-identity/cloudfront/", { Ref: originAccessIdentityLogicalId }]
                  ]
                }
              }
            }
          ]
        }
      }
    });
    expect(cfTemplate.Resources[originPolicyId]).toStrictEqual({
      Type: "AWS::CloudFront::OriginRequestPolicy",
      Properties: {
        OriginRequestPolicyConfig: {
          Name: "app-dev-backend",
          Comment: "Origin request policy for the backend website.",
          CookiesConfig: { CookieBehavior: "all" },
          QueryStringsConfig: { QueryStringBehavior: "all" },
          HeadersConfig: {
            HeaderBehavior: "whitelist",
            Headers: [
              "Accept",
              "Accept-Language",
              "Content-Type",
              "Origin",
              "Referer",
              "User-Agent",
              "X-Requested-With",
              "X-Forwarded-Host"
            ]
          }
        }
      }
    });
    expect(cfTemplate.Resources[cachePolicyId]).toStrictEqual({
      Type: "AWS::CloudFront::CachePolicy",
      Properties: {
        CachePolicyConfig: {
          Comment: "Cache policy for the backend website.",
          DefaultTTL: 0,
          MaxTTL: 31536e3,
          MinTTL: 0,
          Name: "app-dev-backend",
          ParametersInCacheKeyAndForwardedToOrigin: {
            CookiesConfig: { CookieBehavior: "all" },
            QueryStringsConfig: { QueryStringBehavior: "all" },
            HeadersConfig: {
              HeaderBehavior: "whitelist",
              Headers: ["Authorization"]
            },
            EnableAcceptEncodingBrotli: false,
            EnableAcceptEncodingGzip: false
          }
        }
      }
    });
    expect(cfTemplate.Resources[requestFunction]).toMatchObject({
      Type: "AWS::CloudFront::Function",
      Properties: {
        Name: "app-dev-us-east-1-backend-request",
        FunctionConfig: {
          Comment: "app-dev-us-east-1-backend-request",
          Runtime: "cloudfront-js-1.0"
        },
        AutoPublish: true
      }
    });
    expect(cfTemplate.Outputs).toMatchObject({
      [computeLogicalId("backend", "AssetsBucketName")]: {
        Description: "Name of the bucket that stores the website assets.",
        Value: { Ref: bucketLogicalId }
      },
      [computeLogicalId("backend", "Domain")]: {
        Description: "Website domain name.",
        Value: { "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"] }
      },
      [computeLogicalId("backend", "CloudFrontCName")]: {
        Description: "CloudFront CNAME.",
        Value: { "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"] }
      },
      [computeLogicalId("backend", "DistributionId")]: {
        Description: "ID of the CloudFront distribution.",
        Value: { Ref: cfDistributionLogicalId }
      }
    });
  });
  it("assets should be optional", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website"
          }
        }
      })
    });
    const bucketLogicalId = computeLogicalId("backend", "Assets");
    const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
    const cfOriginId1 = computeLogicalId("backend", "CDN", "Origin1");
    const originPolicyId = computeLogicalId("backend", "BackendOriginPolicy");
    const cachePolicyId = computeLogicalId("backend", "BackendCachePolicy");
    const requestFunction = computeLogicalId("backend", "RequestFunction");
    expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
      "ServerlessDeploymentBucket",
      "ServerlessDeploymentBucketPolicy",
      bucketLogicalId,
      originPolicyId,
      cachePolicyId,
      requestFunction,
      cfDistributionLogicalId
    ]);
    expect(cfTemplate.Resources[cfDistributionLogicalId]).toStrictEqual({
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Comment: "app-dev backend website CDN",
          CustomErrorResponses: [
            { ErrorCachingMinTTL: 0, ErrorCode: 500 },
            { ErrorCachingMinTTL: 0, ErrorCode: 504 }
          ],
          DefaultCacheBehavior: {
            AllowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
            Compress: true,
            CachePolicyId: { Ref: cachePolicyId },
            OriginRequestPolicyId: { Ref: originPolicyId },
            TargetOriginId: cfOriginId1,
            ViewerProtocolPolicy: "redirect-to-https",
            FunctionAssociations: [
              {
                EventType: "viewer-request",
                FunctionARN: { "Fn::GetAtt": [requestFunction, "FunctionARN"] }
              }
            ]
          },
          Enabled: true,
          HttpVersion: "http2",
          IPV6Enabled: true,
          Origins: [
            {
              Id: cfOriginId1,
              CustomOriginConfig: {
                OriginProtocolPolicy: "https-only",
                OriginSSLProtocols: ["TLSv1.2"]
              },
              DomainName: {
                "Fn::Join": [".", [{ Ref: "HttpApi" }, "execute-api.us-east-1.amazonaws.com"]]
              }
            }
          ]
        }
      }
    });
  });
  it("should support REST APIs", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website",
            apiGateway: "rest"
          }
        }
      })
    });
    expect(cfTemplate.Resources[computeLogicalId("backend", "CDN")]).toMatchObject({
      Properties: {
        DistributionConfig: {
          Origins: [
            {
              CustomOriginConfig: {
                OriginProtocolPolicy: "https-only",
                OriginSSLProtocols: ["TLSv1.2"]
              },
              DomainName: {
                "Fn::Join": [
                  ".",
                  [{ Ref: "ApiGatewayRestApi" }, "execute-api.us-east-1.amazonaws.com"]
                ]
              }
            }
          ]
        }
      }
    });
  });
  it("should support a custom domain", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website",
            assets: {
              "/assets/*": "public"
            },
            domain: "example.com",
            certificate: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123"
          }
        }
      })
    });
    const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
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
      [computeLogicalId("backend", "Domain")]: {
        Description: "Website domain name.",
        Value: "example.com"
      },
      [computeLogicalId("backend", "CloudFrontCName")]: {
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
          backend: {
            type: "server-side-website",
            assets: {
              "/assets/*": "public"
            },
            domain: ["example.com", "www.example.com"],
            certificate: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123"
          }
        }
      })
    });
    const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
    expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Aliases: ["example.com", "www.example.com"]
        }
      }
    });
    expect(cfTemplate.Outputs).toMatchObject({
      [computeLogicalId("backend", "Domain")]: {
        Description: "Website domain name.",
        Value: "example.com"
      },
      [computeLogicalId("backend", "CloudFrontCName")]: {
        Description: "CloudFront CNAME.",
        Value: {
          "Fn::GetAtt": [cfDistributionLogicalId, "DomainName"]
        }
      }
    });
  });
  it("should allow to customize the error page", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website",
            errorPage: "my/custom/error-page.html"
          }
        }
      })
    });
    const cfDistributionLogicalId = computeLogicalId("backend", "CDN");
    expect(cfTemplate.Resources[cfDistributionLogicalId]).toMatchObject({
      Properties: {
        DistributionConfig: {
          CustomErrorResponses: [
            {
              ErrorCode: 500,
              ErrorCachingMinTTL: 0,
              ResponsePagePath: "/error-page.html"
            },
            {
              ErrorCode: 504,
              ErrorCachingMinTTL: 0,
              ResponsePagePath: "/error-page.html"
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
            backend: {
              type: "server-side-website",
              errorPage: "/error.css"
            }
          }
        })
      });
    }).rejects.toThrowError("Invalid configuration in 'constructs.backend.errorPage': the custom error page must be a static HTML file. '/error.css' does not end with '.html'.");
  });
  it("should validate the assets configuration", async () => {
    await expect(() => {
      return (0, import_runServerless.runServerless)({
        command: "package",
        config: Object.assign(import_runServerless.baseConfig, {
          constructs: {
            backend: {
              type: "server-side-website",
              assets: {
                "/": "public"
              }
            }
          }
        })
      });
    }).rejects.toThrowError("Invalid key in 'constructs.backend.assets': '/' and '/*' cannot be routed to assets because the root URL already serves the backend application running in Lambda. You must use a sub-path instead, for example '/assets/*'.");
  });
  it("should allow to redirect to the main domain", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website",
            domain: ["www.example.com", "example.com"],
            certificate: "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
            redirectToMainDomain: true
          }
        }
      })
    });
    const edgeFunction = computeLogicalId("backend", "RequestFunction");
    expect(cfTemplate.Resources[edgeFunction]).toMatchObject({
      Type: "AWS::CloudFront::Function",
      Properties: {
        FunctionCode: `function handler(event) {
    var request = event.request;
    request.headers["x-forwarded-host"] = request.headers["host"];
    if (request.headers["host"].value !== "www.example.com") {
        return {
            statusCode: 301,
            statusDescription: "Moved Permanently",
            headers: {
                location: {
                    value: "https://www.example.com" + request.uri
                }
            }
        };
    }
    return request;
}`
      }
    });
  });
  it("should allow to override the forwarded headers", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website",
            forwardedHeaders: ["X-My-Custom-Header", "X-My-Other-Custom-Header"]
          }
        }
      })
    });
    expect(cfTemplate.Resources[computeLogicalId("backend", "BackendOriginPolicy")]).toMatchObject({
      Properties: {
        OriginRequestPolicyConfig: {
          HeadersConfig: {
            HeaderBehavior: "whitelist",
            Headers: ["X-My-Custom-Header", "X-My-Other-Custom-Header"]
          }
        }
      }
    });
  });
  it("should not forward the Authorization header in the Origin Policy", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website",
            forwardedHeaders: ["Authorization", "X-My-Custom-Header"]
          }
        }
      })
    });
    expect(cfTemplate.Resources[computeLogicalId("backend", "BackendOriginPolicy")]).toMatchObject({
      Properties: {
        OriginRequestPolicyConfig: {
          HeadersConfig: {
            Headers: ["X-My-Custom-Header"]
          }
        }
      }
    });
  });
  it("should forbid to force forwarding the Host header", async () => {
    await expect(() => {
      return (0, import_runServerless.runServerless)({
        command: "package",
        config: Object.assign(import_runServerless.baseConfig, {
          constructs: {
            backend: {
              type: "server-side-website",
              forwardedHeaders: ["Host"]
            }
          }
        })
      });
    }).rejects.toThrowError("Invalid value in 'constructs.backend.forwardedHeaders': the 'Host' header cannot be forwarded (this is an API Gateway limitation). Use the 'X-Forwarded-Host' header in your code instead (it contains the value of the original 'Host' header).");
  });
  it("should error if more than 10 headers are configured", async () => {
    await expect(() => {
      return (0, import_runServerless.runServerless)({
        command: "package",
        config: Object.assign(import_runServerless.baseConfig, {
          constructs: {
            backend: {
              type: "server-side-website",
              forwardedHeaders: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
            }
          }
        })
      });
    }).rejects.toThrowError("Invalid value in 'constructs.backend.forwardedHeaders': 11 headers are configured but only 10 headers can be forwarded (this is an CloudFront limitation).");
  });
  it("should synchronize assets to S3", async () => {
    const awsMock = (0, import_mockAws.mockAws)();
    sinon.stub(CloudFormationHelpers, "getStackOutput").resolves("bucket-name");
    awsMock.mockService("S3", "listObjectsV2").resolves({
      IsTruncated: false,
      Contents: [
        {
          Key: "assets/logo.png",
          ETag: (0, import_s3_sync.computeS3ETag)(fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/logo.png")))
        },
        { Key: "assets/styles.css" },
        { Key: "assets/image.jpg" }
      ]
    });
    const putObjectSpy = awsMock.mockService("S3", "putObject");
    const deleteObjectsSpy = awsMock.mockService("S3", "deleteObjects").resolves({
      Deleted: [
        {
          Key: "assets/image.jpg"
        }
      ]
    });
    const cloudfrontInvalidationSpy = awsMock.mockService("CloudFront", "createInvalidation");
    await (0, import_runServerless.runServerless)({
      fixture: "serverSideWebsite",
      configExt: import_runServerless.pluginConfigExt,
      command: "backend:assets:upload"
    });
    sinon.assert.callCount(putObjectSpy, 3);
    expect(putObjectSpy.firstCall.firstArg).toEqual({
      Bucket: "bucket-name",
      Key: "assets/scripts.js",
      Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/scripts.js")),
      ContentType: "application/javascript"
    });
    expect(putObjectSpy.secondCall.firstArg).toEqual({
      Bucket: "bucket-name",
      Key: "assets/styles.css",
      Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/public/styles.css")),
      ContentType: "text/css"
    });
    expect(putObjectSpy.thirdCall.firstArg).toEqual({
      Bucket: "bucket-name",
      Key: "error.html",
      Body: fs.readFileSync(path.join(__dirname, "../fixtures/serverSideWebsite/error.html")),
      ContentType: "text/html"
    });
    sinon.assert.calledOnce(deleteObjectsSpy);
    expect(deleteObjectsSpy.firstCall.firstArg).toEqual({
      Bucket: "bucket-name",
      Delete: {
        Objects: [
          {
            Key: "assets/image.jpg"
          }
        ]
      }
    });
    sinon.assert.calledOnce(cloudfrontInvalidationSpy);
  });
  it("allows overriding server side website properties", async () => {
    const { cfTemplate, computeLogicalId } = await (0, import_runServerless.runServerless)({
      command: "package",
      config: Object.assign(import_runServerless.baseConfig, {
        constructs: {
          backend: {
            type: "server-side-website",
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
    expect(cfTemplate.Resources[computeLogicalId("backend", "CDN")].Properties).toMatchObject({
      DistributionConfig: {
        Comment: "This is my comment"
      }
    });
    expect(cfTemplate.Resources[computeLogicalId("backend", "Assets")].Properties).toMatchObject({
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
            type: "server-side-website"
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
  });
});
//# sourceMappingURL=serverSideWebsite.test.js.map
