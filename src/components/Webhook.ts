import { Construct, Fn } from "@aws-cdk/core";
import { CfnIntegration, CfnRoute, HttpApi } from "@aws-cdk/aws-apigatewayv2";
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
        path: { type: "string" },
        type: { type: "string" },
    },
    required: ["path"],
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
        });
    }
}
