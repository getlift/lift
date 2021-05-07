import { Construct, Fn } from "@aws-cdk/core";
import { CfnAuthorizer, CfnIntegration, CfnRoute, HttpApi } from "@aws-cdk/aws-apigatewayv2";
import { Function } from "@aws-cdk/aws-lambda";
import { EventBus } from "@aws-cdk/aws-events";
import { FromSchema } from "json-schema-to-ts";
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import type { Serverless } from "../types/serverless";
import { Component, ComponentConstruct } from "../classes/Component";

const LIFT_COMPONENT_NAME_PATTERN = "^[a-zA-Z0-9-_]+$";
const WEBHOOK_COMPONENT = "webhook";
const WEBHOOK_DEFINITION = {
    type: "object",
    properties: {
        authorizer: {
            type: "object",
            properties: {
                handler: { type: "string" },
            },
            required: ["handler"],
            additionalProperties: true,
        },
        path: { type: "string" },
        type: { type: "string" },
    },
    required: ["authorizer", "path"],
    additionalProperties: false,
} as const;
const WEBHOOK_DEFINITIONS = {
    type: "object",
    minProperties: 1,
    patternProperties: {
        [LIFT_COMPONENT_NAME_PATTERN]: WEBHOOK_DEFINITION,
    },
    additionalProperties: false,
} as const;

export class Webhook extends Component<typeof WEBHOOK_COMPONENT, typeof WEBHOOK_DEFINITIONS, WebhookConstruct> {
    constructor(serverless: Serverless) {
        super({
            name: WEBHOOK_COMPONENT,
            serverless,
            schema: WEBHOOK_DEFINITIONS,
        });

        this.appendFunctions();
    }

    appendFunctions(): void {
        Object.entries(this.getConfiguration()).map(([webhookName, webhookConfiguration]) => {
            Object.assign(this.serverless.service.functions, {
                [`${webhookName}Authorizer`]: webhookConfiguration.authorizer,
            });
        });
    }

    compile(): void {
        const webhookConfigurations = Object.entries(this.getConfiguration());
        if (webhookConfigurations.length !== 0) {
            const api = new HttpApi(this, "HttpApi");
            const bus = new EventBus(this, "Bus");
            const apiGatewayRole = new Role(this, "ApiGatewayRole", {
                assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
                inlinePolicies: {
                    EventBridge: new PolicyDocument({
                        statements: [
                            new PolicyStatement({
                                actions: ["events:PutEvents"],
                                resources: [bus.eventBusArn],
                            }),
                        ],
                    }),
                },
            });
            webhookConfigurations.map(([webhookName, webhookConfiguration]) => {
                new WebhookConstruct(
                    this,
                    webhookName,
                    this.serverless,
                    api,
                    bus,
                    apiGatewayRole,
                    webhookConfiguration
                );
            });
        }
    }
}

class WebhookConstruct extends ComponentConstruct {
    constructor(
        scope: Construct,
        id: string,
        serverless: Serverless,
        api: HttpApi,
        bus: EventBus,
        apiGatewayRole: Role,
        webhookConfiguration: FromSchema<typeof WEBHOOK_DEFINITION>
    ) {
        super(scope, id, serverless);

        const region = serverless.getProvider("aws").getRegion();
        const lambda = Function.fromFunctionArn(
            this,
            "LambdaAuthorizer",
            (Fn.getAtt(
                serverless.getProvider("aws").naming.getLambdaLogicalId(`${id}Authorizer`),
                "Arn"
            ) as unknown) as string
        );
        lambda.grantInvoke(apiGatewayRole);
        const authorizer = new CfnAuthorizer(this, "Authorizer", {
            apiId: api.apiId,
            authorizerPayloadFormatVersion: "2.0",
            authorizerType: "REQUEST",
            name: `${id}-authorizer`,
            identitySource: ["$request.header.Authorization"],
            enableSimpleResponses: true,
            authorizerUri: Fn.join("/", [
                `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions`,
                lambda.functionArn,
                "invocations",
            ]),
        });
        const eventBridgeIntegration = new CfnIntegration(this, "Integration", {
            apiId: api.apiId,
            connectionType: "INTERNET",
            credentialsArn: apiGatewayRole.roleArn,
            integrationSubtype: "EventBridge-PutEvents",
            integrationType: "AWS_PROXY",
            payloadFormatVersion: "1.0",
            requestParameters: {
                DetailType: webhookConfiguration.type ?? "Webhook",
                Detail: "$request.body",
                Source: id,
                EventBusName: bus.eventBusName,
            },
        });
        new CfnRoute(this, "Route", {
            apiId: api.apiId,
            routeKey: `POST ${webhookConfiguration.path}`,
            target: Fn.join("/", ["integrations", eventBridgeIntegration.ref]),
            authorizerId: authorizer.ref,
            authorizationType: "CUSTOM",
        });
    }
}
