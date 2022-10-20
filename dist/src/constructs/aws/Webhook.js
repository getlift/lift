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
  Webhook: () => Webhook
});
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_aws_apigatewayv2 = __toModule(require("aws-cdk-lib/aws-apigatewayv2"));
var import_aws_apigatewayv2_alpha = __toModule(require("@aws-cdk/aws-apigatewayv2-alpha"));
var import_aws_lambda = __toModule(require("aws-cdk-lib/aws-lambda"));
var import_aws_events = __toModule(require("aws-cdk-lib/aws-events"));
var import_aws_iam = __toModule(require("aws-cdk-lib/aws-iam"));
var import_abstracts = __toModule(require("@lift/constructs/abstracts"));
var import_error = __toModule(require("../../utils/error"));
const WEBHOOK_DEFINITION = {
  type: "object",
  properties: {
    type: { const: "webhook" },
    authorizer: {
      type: "object",
      properties: {
        handler: { type: "string" }
      },
      required: ["handler"],
      additionalProperties: true
    },
    insecure: { type: "boolean" },
    path: { type: "string" },
    eventType: { type: "string" }
  },
  required: ["path"],
  additionalProperties: false
};
const WEBHOOK_DEFAULTS = {
  insecure: false
};
class Webhook extends import_abstracts.AwsConstruct {
  constructor(scope, id, configuration, provider) {
    super(scope, id);
    this.id = id;
    this.configuration = configuration;
    this.provider = provider;
    var _a;
    this.api = new import_aws_apigatewayv2_alpha.HttpApi(this, "HttpApi");
    this.apiEndpointOutput = new import_aws_cdk_lib.CfnOutput(this, "HttpApiEndpoint", {
      value: this.api.apiEndpoint
    });
    this.bus = new import_aws_events.EventBus(this, "Bus");
    const apiGatewayRole = new import_aws_iam.Role(this, "ApiGatewayRole", {
      assumedBy: new import_aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
      inlinePolicies: {
        EventBridge: new import_aws_iam.PolicyDocument({
          statements: [
            new import_aws_iam.PolicyStatement({
              actions: ["events:PutEvents"],
              resources: [this.bus.eventBusArn]
            })
          ]
        })
      }
    });
    const resolvedConfiguration = Object.assign({}, WEBHOOK_DEFAULTS, configuration);
    if (resolvedConfiguration.insecure && resolvedConfiguration.authorizer !== void 0) {
      throw new import_error.default(`Webhook ${id} is specified as insecure, however an authorizer is configured for this webhook. Either declare this webhook as secure by removing \`insecure: true\` property (recommended), or specify the webhook as insecure and remove the authorizer property altogether.
See https://github.com/getlift/lift/blob/master/docs/webhook.md#authorizer`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
    }
    if (!resolvedConfiguration.insecure && resolvedConfiguration.authorizer === void 0) {
      throw new import_error.default(`Webhook ${id} is specified as secure, however no authorizer is configured for this webhook. Please provide an authorizer property for this webhook (recommended), or specify the webhook as insecure by adding \`insecure: true\` property.
See https://github.com/getlift/lift/blob/master/docs/webhook.md#authorizer`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
    }
    const eventBridgeIntegration = new import_aws_apigatewayv2.CfnIntegration(this, "Integration", {
      apiId: this.api.apiId,
      connectionType: "INTERNET",
      credentialsArn: apiGatewayRole.roleArn,
      integrationSubtype: "EventBridge-PutEvents",
      integrationType: "AWS_PROXY",
      payloadFormatVersion: "1.0",
      requestParameters: {
        DetailType: (_a = resolvedConfiguration.eventType) != null ? _a : "Webhook",
        Detail: "$request.body",
        Source: id,
        EventBusName: this.bus.eventBusName
      }
    });
    const route = new import_aws_apigatewayv2.CfnRoute(this, "Route", {
      apiId: this.api.apiId,
      routeKey: `POST ${resolvedConfiguration.path}`,
      target: import_aws_cdk_lib.Fn.join("/", ["integrations", eventBridgeIntegration.ref]),
      authorizationType: "NONE"
    });
    if (!resolvedConfiguration.insecure) {
      const lambda = import_aws_lambda.Function.fromFunctionArn(this, "LambdaAuthorizer", import_aws_cdk_lib.Fn.getAtt(provider.naming.getLambdaLogicalId(`${id}Authorizer`), "Arn").toString());
      lambda.grantInvoke(apiGatewayRole);
      const authorizer = new import_aws_apigatewayv2.CfnAuthorizer(this, "Authorizer", {
        apiId: this.api.apiId,
        authorizerPayloadFormatVersion: "2.0",
        authorizerType: "REQUEST",
        name: `${id}-authorizer`,
        enableSimpleResponses: true,
        authorizerUri: import_aws_cdk_lib.Fn.join("/", [
          `arn:aws:apigateway:${this.provider.region}:lambda:path/2015-03-31/functions`,
          lambda.functionArn,
          "invocations"
        ]),
        authorizerCredentialsArn: apiGatewayRole.roleArn
      });
      route.authorizerId = authorizer.ref;
      route.authorizationType = "CUSTOM";
    }
    this.endpointPathOutput = new import_aws_cdk_lib.CfnOutput(this, "Endpoint", {
      value: route.routeKey
    });
    this.appendFunctions();
  }
  outputs() {
    return {
      httpMethod: () => this.getHttpMethod(),
      url: () => this.getUrl()
    };
  }
  variables() {
    return {
      busName: this.bus.eventBusName
    };
  }
  extend() {
    return {
      api: this.api.node.defaultChild,
      bus: this.bus.node.defaultChild
    };
  }
  appendFunctions() {
    const resolvedWebhookConfiguration = Object.assign({}, WEBHOOK_DEFAULTS, this.configuration);
    if (resolvedWebhookConfiguration.insecure) {
      return;
    }
    this.provider.addFunction(`${this.id}Authorizer`, resolvedWebhookConfiguration.authorizer);
  }
  async getEndpointPath() {
    return this.provider.getStackOutput(this.endpointPathOutput);
  }
  async getHttpMethod() {
    const endpointPath = await this.getEndpointPath();
    if (endpointPath === void 0) {
      return void 0;
    }
    const [httpMethod] = endpointPath.split(" ");
    return httpMethod;
  }
  async getUrl() {
    const apiEndpoint = await this.provider.getStackOutput(this.apiEndpointOutput);
    if (apiEndpoint === void 0) {
      return void 0;
    }
    const endpointPath = await this.getEndpointPath();
    if (endpointPath === void 0) {
      return void 0;
    }
    const [, path] = endpointPath.split(" ");
    return apiEndpoint + path;
  }
}
Webhook.type = "webhook";
Webhook.schema = WEBHOOK_DEFINITION;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Webhook
});
//# sourceMappingURL=Webhook.js.map
