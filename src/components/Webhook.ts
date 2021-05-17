import { CfnOutput, Construct, Fn } from "@aws-cdk/core";
import { CfnAuthorizer, CfnIntegration, CfnRoute, HttpApi } from "@aws-cdk/aws-apigatewayv2";
import { Function } from "@aws-cdk/aws-lambda";
import { EventBus } from "@aws-cdk/aws-events";
import { FromSchema } from "json-schema-to-ts";
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import chalk from "chalk";
import { isString } from "lodash";
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
        insecure: { type: "boolean" },
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
const WEBHOOK_DEFAULTS = {
    insecure: false,
};

export class Webhook extends Component<typeof WEBHOOK_COMPONENT, typeof WEBHOOK_DEFINITIONS, WebhookConstruct> {
    private bus?: EventBus;
    private apiEndpoint?: CfnOutput;
    constructor(serverless: Serverless) {
        super({
            name: WEBHOOK_COMPONENT,
            serverless,
            schema: WEBHOOK_DEFINITIONS,
        });

        this.configurationVariablesSources = {
            [WEBHOOK_COMPONENT]: {
                resolve: this.resolve.bind(this),
            },
        };

        this.appendFunctions();

        this.hooks["before:aws:info:displayStackOutputs"] = this.info.bind(this);
    }

    resolve({ address }: { address: string }): { value: Record<string, unknown> } {
        if (address === "busName" && this.bus) {
            return {
                value: this.getCloudFormationReference(this.bus.eventBusName),
            };
        }
        throw new Error("Only ${webhook:busName} is a valid variable");
    }

    async info(): Promise<void> {
        if (!this.apiEndpoint) {
            return;
        }
        const apiEndpoint = await this.getOutputValue(this.apiEndpoint);
        const webhooks: { name: string; endpoint: string }[] = [];
        for (const webhookComponent of this.getComponents()) {
            const endpoint = await webhookComponent.getEndpointPath();
            if (isString(endpoint)) {
                webhooks.push({
                    name: webhookComponent.id,
                    endpoint,
                });
            }
        }
        if (!isString(apiEndpoint) || webhooks.length <= 0) {
            return;
        }
        console.log(chalk.yellow("webhooks:"));
        for (const { name, endpoint } of webhooks) {
            const [httpMethod, path] = endpoint.split(" ");
            console.log(`  ${name}: ${httpMethod} ${apiEndpoint}${path}`);
        }
    }

    appendFunctions(): void {
        Object.entries(this.getConfiguration()).map(([webhookName, webhookConfiguration]) => {
            const resolvedWebhookConfiguration = Object.assign({}, WEBHOOK_DEFAULTS, webhookConfiguration);
            if (resolvedWebhookConfiguration.insecure) {
                return;
            }
            Object.assign(this.serverless.service.functions, {
                [`${webhookName}Authorizer`]: resolvedWebhookConfiguration.authorizer,
            });
        });
    }

    compile(): void {
        const webhookConfigurations = Object.entries(this.getConfiguration());
        if (webhookConfigurations.length !== 0) {
            const api = new HttpApi(this, "HttpApi");
            this.apiEndpoint = new CfnOutput(this, "HttpApiEndpoint", {
                value: api.apiEndpoint,
            });
            const bus = new EventBus(this, "Bus");
            this.bus = bus;
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
    private endpointPathOutput: CfnOutput;
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

        const resolvedWebhookConfiguration = Object.assign({}, WEBHOOK_DEFAULTS, webhookConfiguration);
        if (resolvedWebhookConfiguration.insecure && resolvedWebhookConfiguration.authorizer !== undefined) {
            throw new Error(
                `Webhook ${id} is specified as insecure, however an authorizer is configured for this webhook. ` +
                    "Either declare this webhook as secure by removing `insecure: true` property (recommended), " +
                    "or specify the webhook as insecure and remove the authorizer property altogether."
            );
        }
        if (!resolvedWebhookConfiguration.insecure && resolvedWebhookConfiguration.authorizer === undefined) {
            throw new Error(
                `Webhook ${id} is specified as secure, however no authorizer is configured for this webhook. ` +
                    "Please provide an authorizer property for this webhook (recommended), " +
                    "or specify the webhook as insecure by adding `insecure: true` property."
            );
        }

        const eventBridgeIntegration = new CfnIntegration(this, "Integration", {
            apiId: api.apiId,
            connectionType: "INTERNET",
            credentialsArn: apiGatewayRole.roleArn,
            integrationSubtype: "EventBridge-PutEvents",
            integrationType: "AWS_PROXY",
            payloadFormatVersion: "1.0",
            requestParameters: {
                DetailType: resolvedWebhookConfiguration.type ?? "Webhook",
                Detail: "$request.body",
                Source: id,
                EventBusName: bus.eventBusName,
            },
        });
        const route = new CfnRoute(this, "Route", {
            apiId: api.apiId,
            routeKey: `POST ${resolvedWebhookConfiguration.path}`,
            target: Fn.join("/", ["integrations", eventBridgeIntegration.ref]),
            authorizationType: "NONE",
        });

        if (!resolvedWebhookConfiguration.insecure) {
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
                    `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions`,
                    lambda.functionArn,
                    "invocations",
                ]),
                authorizerCredentialsArn: apiGatewayRole.roleArn,
            });
            route.authorizerId = authorizer.ref;
            route.authorizationType = "CUSTOM";
        }

        this.endpointPathOutput = new CfnOutput(this, "Endpoint", {
            value: route.routeKey,
        });
    }

    async getEndpointPath() {
        return this.getOutputValue(this.endpointPathOutput);
    }
}
