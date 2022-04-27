import type { Construct as CdkConstruct } from "constructs";
import { CfnOutput, Fn } from "aws-cdk-lib";
import { CfnAuthorizer, CfnIntegration, CfnRoute } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { Function } from "aws-cdk-lib/aws-lambda";
import { EventBus } from "aws-cdk-lib/aws-events";
import type { FromSchema } from "json-schema-to-ts";
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import ServerlessError from "../../utils/error";

const WEBHOOK_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "webhook" },
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
        eventType: { type: "string" },
    },
    required: ["path"],
    additionalProperties: false,
} as const;
const WEBHOOK_DEFAULTS = {
    insecure: false,
};

type Configuration = FromSchema<typeof WEBHOOK_DEFINITION>;

export class Webhook extends AwsConstruct {
    public static type = "webhook";
    public static schema = WEBHOOK_DEFINITION;

    private readonly bus: EventBus;
    private readonly apiEndpointOutput: CfnOutput;
    private readonly endpointPathOutput: CfnOutput;

    constructor(
        scope: CdkConstruct,
        private readonly id: string,
        private readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);

        const api = new HttpApi(this, "HttpApi");
        this.apiEndpointOutput = new CfnOutput(this, "HttpApiEndpoint", {
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

        const resolvedConfiguration = Object.assign({}, WEBHOOK_DEFAULTS, configuration);
        if (resolvedConfiguration.insecure && resolvedConfiguration.authorizer !== undefined) {
            throw new ServerlessError(
                `Webhook ${id} is specified as insecure, however an authorizer is configured for this webhook. ` +
                    "Either declare this webhook as secure by removing `insecure: true` property (recommended), " +
                    "or specify the webhook as insecure and remove the authorizer property altogether.\n" +
                    "See https://github.com/getlift/lift/blob/master/docs/webhook.md#authorizer",
                "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
            );
        }
        if (!resolvedConfiguration.insecure && resolvedConfiguration.authorizer === undefined) {
            throw new ServerlessError(
                `Webhook ${id} is specified as secure, however no authorizer is configured for this webhook. ` +
                    "Please provide an authorizer property for this webhook (recommended), " +
                    "or specify the webhook as insecure by adding `insecure: true` property.\n" +
                    "See https://github.com/getlift/lift/blob/master/docs/webhook.md#authorizer",
                "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
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
                DetailType: resolvedConfiguration.eventType ?? "Webhook",
                Detail: "$request.body",
                Source: id,
                EventBusName: bus.eventBusName,
            },
        });
        const route = new CfnRoute(this, "Route", {
            apiId: api.apiId,
            routeKey: `POST ${resolvedConfiguration.path}`,
            target: Fn.join("/", ["integrations", eventBridgeIntegration.ref]),
            authorizationType: "NONE",
        });

        if (!resolvedConfiguration.insecure) {
            const lambda = Function.fromFunctionArn(
                this,
                "LambdaAuthorizer",
                Fn.getAtt(provider.naming.getLambdaLogicalId(`${id}Authorizer`), "Arn").toString()
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
                    `arn:aws:apigateway:${this.provider.region}:lambda:path/2015-03-31/functions`,
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

        this.appendFunctions();
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            httpMethod: () => this.getHttpMethod(),
            url: () => this.getUrl(),
        };
    }

    variables(): Record<string, unknown> {
        return {
            busName: this.bus.eventBusName,
        };
    }

    private appendFunctions(): void {
        const resolvedWebhookConfiguration = Object.assign({}, WEBHOOK_DEFAULTS, this.configuration);
        if (resolvedWebhookConfiguration.insecure) {
            return;
        }
        this.provider.addFunction(`${this.id}Authorizer`, resolvedWebhookConfiguration.authorizer);
    }

    private async getEndpointPath(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.endpointPathOutput);
    }

    private async getHttpMethod(): Promise<string | undefined> {
        const endpointPath = await this.getEndpointPath();
        if (endpointPath === undefined) {
            return undefined;
        }
        const [httpMethod] = endpointPath.split(" ");

        return httpMethod;
    }

    private async getUrl(): Promise<string | undefined> {
        const apiEndpoint = await this.provider.getStackOutput(this.apiEndpointOutput);
        if (apiEndpoint === undefined) {
            return undefined;
        }
        const endpointPath = await this.getEndpointPath();
        if (endpointPath === undefined) {
            return undefined;
        }
        const [, path] = endpointPath.split(" ");

        return apiEndpoint + path;
    }
}
