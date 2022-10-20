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
  ServerSideWebsite: () => ServerSideWebsite
});
var import_aws_s3 = __toModule(require("aws-cdk-lib/aws-s3"));
var import_aws_cloudfront = __toModule(require("aws-cdk-lib/aws-cloudfront"));
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_aws_cloudfront_origins = __toModule(require("aws-cdk-lib/aws-cloudfront-origins"));
var acm = __toModule(require("aws-cdk-lib/aws-certificatemanager"));
var path = __toModule(require("path"));
var fs = __toModule(require("fs"));
var import_lodash = __toModule(require("lodash"));
var cloudfront = __toModule(require("aws-cdk-lib/aws-cloudfront"));
var import_abstracts = __toModule(require("@lift/constructs/abstracts"));
var import_naming = __toModule(require("../../utils/naming"));
var import_s3_sync = __toModule(require("../../utils/s3-sync"));
var import_aws = __toModule(require("../../classes/aws"));
var import_error = __toModule(require("../../utils/error"));
var import_cloudfrontFunctions = __toModule(require("../../classes/cloudfrontFunctions"));
var import_logger = __toModule(require("../../utils/logger"));
const SCHEMA = {
  type: "object",
  properties: {
    type: { const: "server-side-website" },
    apiGateway: { enum: ["http", "rest"] },
    assets: {
      type: "object",
      additionalProperties: { type: "string" },
      propertyNames: {
        pattern: "^/.*$"
      },
      minProperties: 1
    },
    dynamic_assets: {
      type: "array",
      additionalProperties: { type: "string" },
      propertyNames: {
        pattern: "^/.*$"
      }
    },
    errorPage: { type: "string" },
    domain: {
      anyOf: [
        { type: "string" },
        {
          type: "array",
          items: { type: "string" }
        }
      ]
    },
    redirectToMainDomain: { type: "boolean" },
    certificate: { type: "string" },
    forwardedHeaders: { type: "array", items: { type: "string" } }
  },
  additionalProperties: false
};
const _ServerSideWebsite = class extends import_abstracts.AwsConstruct {
  constructor(scope, id, configuration, provider) {
    super(scope, id);
    this.id = id;
    this.configuration = configuration;
    this.provider = provider;
    if (configuration.domain !== void 0 && configuration.certificate === void 0) {
      throw new import_error.default(`Invalid configuration in 'constructs.${id}.certificate': if a domain is configured, then a certificate ARN must be configured as well.`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
    }
    if (configuration.errorPage !== void 0 && !configuration.errorPage.endsWith(".html")) {
      throw new import_error.default(`Invalid configuration in 'constructs.${id}.errorPage': the custom error page must be a static HTML file. '${configuration.errorPage}' does not end with '.html'.`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
    }
    this.bucket = new import_aws_s3.Bucket(this, "Assets", {
      removalPolicy: import_aws_cdk_lib.RemovalPolicy.DESTROY
    });
    const backendOriginPolicy = new import_aws_cloudfront.OriginRequestPolicy(this, "BackendOriginPolicy", {
      originRequestPolicyName: `${this.provider.stackName}-${id}`,
      comment: `Origin request policy for the ${id} website.`,
      cookieBehavior: import_aws_cloudfront.OriginRequestCookieBehavior.all(),
      queryStringBehavior: import_aws_cloudfront.OriginRequestQueryStringBehavior.all(),
      headerBehavior: this.headersToForward()
    });
    const backendCachePolicy = new import_aws_cloudfront.CachePolicy(this, "BackendCachePolicy", {
      cachePolicyName: `${this.provider.stackName}-${id}`,
      comment: `Cache policy for the ${id} website.`,
      defaultTtl: import_aws_cdk_lib.Duration.seconds(0),
      queryStringBehavior: import_aws_cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: import_aws_cloudfront.CacheCookieBehavior.all(),
      headerBehavior: import_aws_cloudfront.CacheHeaderBehavior.allowList("Authorization")
    });
    const apiId = configuration.apiGateway === "rest" ? this.provider.naming.getRestApiLogicalId() : this.provider.naming.getHttpApiLogicalId();
    const apiGatewayDomain = import_aws_cdk_lib.Fn.join(".", [import_aws_cdk_lib.Fn.ref(apiId), `execute-api.${this.provider.region}.amazonaws.com`]);
    this.domains = configuration.domain !== void 0 ? (0, import_lodash.flatten)([configuration.domain]) : void 0;
    const certificate = configuration.certificate !== void 0 ? acm.Certificate.fromCertificateArn(this, "Certificate", configuration.certificate) : void 0;
    this.distribution = new import_aws_cloudfront.Distribution(this, "CDN", {
      comment: `${provider.stackName} ${id} website CDN`,
      defaultBehavior: {
        origin: new import_aws_cloudfront_origins.HttpOrigin(apiGatewayDomain, {
          protocolPolicy: import_aws_cloudfront.OriginProtocolPolicy.HTTPS_ONLY
        }),
        allowedMethods: import_aws_cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: backendCachePolicy,
        viewerProtocolPolicy: import_aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: backendOriginPolicy,
        functionAssociations: [
          {
            function: this.createRequestFunction(),
            eventType: import_aws_cloudfront.FunctionEventType.VIEWER_REQUEST
          }
        ]
      },
      additionalBehaviors: this.createCacheBehaviors(this.bucket),
      errorResponses: this.createErrorResponses(),
      httpVersion: import_aws_cloudfront.HttpVersion.HTTP2,
      certificate,
      domainNames: this.domains
    });
    this.bucketNameOutput = new import_aws_cdk_lib.CfnOutput(this, "AssetsBucketName", {
      description: "Name of the bucket that stores the website assets.",
      value: this.bucket.bucketName
    });
    let websiteDomain = this.getMainCustomDomain();
    if (websiteDomain === void 0) {
      websiteDomain = this.distribution.distributionDomainName;
    }
    this.domainOutput = new import_aws_cdk_lib.CfnOutput(this, "Domain", {
      description: "Website domain name.",
      value: websiteDomain
    });
    this.cnameOutput = new import_aws_cdk_lib.CfnOutput(this, "CloudFrontCName", {
      description: "CloudFront CNAME.",
      value: this.distribution.distributionDomainName
    });
    this.distributionIdOutput = new import_aws_cdk_lib.CfnOutput(this, "DistributionId", {
      description: "ID of the CloudFront distribution.",
      value: this.distribution.distributionId
    });
  }
  outputs() {
    return {
      url: () => this.getUrl(),
      cname: () => this.getCName()
    };
  }
  variables() {
    var _a;
    const domain = (_a = this.getMainCustomDomain()) != null ? _a : this.distribution.distributionDomainName;
    return {
      url: import_aws_cdk_lib.Fn.join("", ["https://", domain]),
      cname: this.distribution.distributionDomainName,
      assetsBucketName: this.bucket.bucketName
    };
  }
  extend() {
    return {
      distribution: this.distribution.node.defaultChild,
      bucket: this.bucket.node.defaultChild
    };
  }
  async postDeploy() {
    await this.uploadAssets();
  }
  async uploadAssetsCommand() {
    (0, import_logger.getUtils)().log(`Deploying the assets for the '${this.id}' website`);
    await this.uploadAssets();
    const domain = await this.getDomain();
    if (domain !== void 0) {
      (0, import_logger.getUtils)().log();
      (0, import_logger.getUtils)().log.success(`Deployed https://${domain}`);
    }
  }
  async uploadAssets() {
    const bucketName = await this.getBucketName();
    if (bucketName === void 0) {
      throw new import_error.default(`Could not find the bucket in which to deploy the '${this.id}' website: did you forget to run 'serverless deploy' first?`, "LIFT_MISSING_STACK_OUTPUT");
    }
    const progress = (0, import_logger.getUtils)().progress;
    let uploadProgress;
    if (progress) {
      uploadProgress = progress.create();
    }
    let invalidate = false;
    for (const [pattern, filePath] of Object.entries(this.getAssetPatterns())) {
      if (!fs.existsSync(filePath)) {
        throw new import_error.default(`Error in 'constructs.${this.id}': the file or directory '${filePath}' does not exist`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
      }
      let s3PathPrefix = path.dirname(pattern);
      if (s3PathPrefix.startsWith("/")) {
        s3PathPrefix = s3PathPrefix.slice(1);
      }
      if (fs.lstatSync(filePath).isDirectory()) {
        if (uploadProgress) {
          uploadProgress.update(`Uploading '${filePath}' to 's3://${bucketName}/${s3PathPrefix}'`);
        } else {
          (0, import_logger.getUtils)().log(`Uploading '${filePath}' to 's3://${bucketName}/${s3PathPrefix}'`);
        }
        const { hasChanges } = this.isDynamicAssetPattern(s3PathPrefix) ? { hasChanges: false } : await (0, import_s3_sync.s3Sync)({
          aws: this.provider,
          localPath: filePath,
          targetPathPrefix: s3PathPrefix,
          bucketName
        });
        invalidate = invalidate || hasChanges;
      } else {
        const targetKey = path.posix.join(s3PathPrefix, path.basename(filePath));
        if (uploadProgress) {
          uploadProgress.update(`Uploading '${filePath}' to 's3://${bucketName}/${targetKey}'`);
        } else {
          (0, import_logger.getUtils)().log(`Uploading '${filePath}' to 's3://${bucketName}/${targetKey}'`);
        }
        await (0, import_s3_sync.s3Put)(this.provider, bucketName, targetKey, fs.readFileSync(filePath));
        invalidate = true;
      }
    }
    if (invalidate) {
      if (uploadProgress) {
        uploadProgress.update(`Clearing CloudFront DNS cache`);
      } else {
        (0, import_logger.getUtils)().log(`Clearing CloudFront DNS cache`);
      }
      await this.clearCDNCache();
    }
    if (uploadProgress) {
      uploadProgress.remove();
    }
  }
  async clearCDNCache() {
    const distributionId = await this.getDistributionId();
    if (distributionId === void 0) {
      return;
    }
    await (0, import_aws.invalidateCloudFrontCache)(this.provider, distributionId);
  }
  async preRemove() {
    const bucketName = await this.getBucketName();
    if (bucketName === void 0) {
      return;
    }
    (0, import_logger.getUtils)().log(`Emptying S3 bucket '${bucketName}' for the '${this.id}' website, else CloudFormation will fail (it cannot delete a non-empty bucket)`);
    await (0, import_aws.emptyBucket)(this.provider, bucketName);
  }
  async getUrl() {
    const domain = await this.getDomain();
    if (domain === void 0) {
      return void 0;
    }
    return `https://${domain}`;
  }
  async getBucketName() {
    return this.provider.getStackOutput(this.bucketNameOutput);
  }
  async getDomain() {
    return this.provider.getStackOutput(this.domainOutput);
  }
  async getCName() {
    return this.provider.getStackOutput(this.cnameOutput);
  }
  async getDistributionId() {
    return this.provider.getStackOutput(this.distributionIdOutput);
  }
  getMainCustomDomain() {
    if (this.configuration.domain === void 0) {
      return void 0;
    }
    return typeof this.configuration.domain === "string" ? this.configuration.domain : this.configuration.domain[0];
  }
  headersToForward() {
    var _a;
    let additionalHeadersToForward = (_a = this.configuration.forwardedHeaders) != null ? _a : [];
    if (additionalHeadersToForward.includes("Host")) {
      throw new import_error.default(`Invalid value in 'constructs.${this.id}.forwardedHeaders': the 'Host' header cannot be forwarded (this is an API Gateway limitation). Use the 'X-Forwarded-Host' header in your code instead (it contains the value of the original 'Host' header).`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
    }
    additionalHeadersToForward = additionalHeadersToForward.filter((header) => header !== "Authorization");
    if (additionalHeadersToForward.length > 0) {
      if (additionalHeadersToForward.length > 10) {
        throw new import_error.default(`Invalid value in 'constructs.${this.id}.forwardedHeaders': ${additionalHeadersToForward.length} headers are configured but only 10 headers can be forwarded (this is an CloudFront limitation).`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
      }
      return import_aws_cloudfront.OriginRequestHeaderBehavior.allowList(...additionalHeadersToForward);
    }
    return import_aws_cloudfront.OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language", "Content-Type", "Origin", "Referer", "User-Agent", "X-Requested-With", "X-Forwarded-Host");
  }
  createCacheBehaviors(bucket) {
    const behaviors = {};
    for (const pattern of Object.keys(this.getAssetPatterns())) {
      if (pattern === "/" || pattern === "/*") {
        throw new import_error.default(`Invalid key in 'constructs.${this.id}.assets': '/' and '/*' cannot be routed to assets because the root URL already serves the backend application running in Lambda. You must use a sub-path instead, for example '/assets/*'.`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
      }
      behaviors[pattern] = {
        origin: new import_aws_cloudfront_origins.S3Origin(bucket),
        allowedMethods: import_aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: import_aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: import_aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      };
    }
    return behaviors;
  }
  createRequestFunction() {
    let additionalCode = "";
    if (this.configuration.redirectToMainDomain === true) {
      additionalCode += (0, import_cloudfrontFunctions.redirectToMainDomain)(this.domains);
    }
    const code = `function handler(event) {
    var request = event.request;
    request.headers["x-forwarded-host"] = request.headers["host"];${additionalCode}
    return request;
}`;
    const functionName = (0, import_naming.ensureNameMaxLength)(`${this.provider.stackName}-${this.provider.region}-${this.id}-request`, 64);
    return new cloudfront.Function(this, "RequestFunction", {
      functionName,
      code: cloudfront.FunctionCode.fromInline(code)
    });
  }
  createErrorResponses() {
    let responsePagePath = void 0;
    if (this.configuration.errorPage !== void 0) {
      responsePagePath = `/${this.getErrorPageFileName()}`;
    }
    return [
      {
        httpStatus: 500,
        ttl: import_aws_cdk_lib.Duration.seconds(0),
        responsePagePath
      },
      {
        httpStatus: 504,
        ttl: import_aws_cdk_lib.Duration.seconds(0),
        responsePagePath
      }
    ];
  }
  getAssetPatterns() {
    var _a;
    const assetPatterns = (_a = this.configuration.assets) != null ? _a : {};
    if (this.configuration.errorPage !== void 0) {
      assetPatterns[`/${this.getErrorPageFileName()}`] = this.configuration.errorPage;
    }
    return assetPatterns;
  }
  isDynamicAssetPattern(pattern) {
    var _a;
    const assetPatterns = (_a = this.configuration.dynamic_assets) != null ? _a : [];
    return assetPatterns.indexOf(pattern) !== -1;
  }
  getErrorPageFileName() {
    return this.configuration.errorPage !== void 0 ? path.basename(this.configuration.errorPage) : "";
  }
};
let ServerSideWebsite = _ServerSideWebsite;
ServerSideWebsite.type = "server-side-website";
ServerSideWebsite.schema = SCHEMA;
ServerSideWebsite.commands = {
  "assets:upload": {
    usage: "Upload assets directly to S3 without going through a CloudFormation deployment.",
    handler: _ServerSideWebsite.prototype.uploadAssetsCommand
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ServerSideWebsite
});
//# sourceMappingURL=ServerSideWebsite.js.map
