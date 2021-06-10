import { Construct as CdkConstruct, CfnOutput, Fn } from "@aws-cdk/core";
import { CfnAuthorizer, CfnIntegration, CfnRoute, HttpApi } from "@aws-cdk/aws-apigatewayv2";
import { Function } from "@aws-cdk/aws-lambda";
import { EventBus } from "@aws-cdk/aws-events";
import { FromSchema } from "json-schema-to-ts";
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import AwsProvider from "../classes/AwsProvider";
import Construct from "../classes/Construct";

export const WEBHOOK_DEFINITION = {
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

export class Webhook extends CdkConstruct implements Construct {
    private readonly bus: EventBus;
    private readonly apiEndpointOutput: CfnOutput;
    private readonly endpointPathOutput: CfnOutput;

    constructor(
        scope: CdkConstruct,
        private readonly id: string,
        private readonly configuration: FromSchema<typeof WEBHOOK_DEFINITION>,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);
        this.bus = provider.getProviderBus();
        const api = new HttpApi(this, "HttpApi");
        this.apiEndpointOutput = new CfnOutput(this, "HttpApiEndpoint", {
            value: api.apiEndpoint,
        });
        const apiGatewayRole = new Role(this, "ApiGatewayRole", {
            assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
            inlinePolicies: {
                EventBridge: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: ["events:PutEvents"],
                            resources: [this.bus.eventBusArn],
                        }),
                    ],
                }),
            },
        });

        const resolvedConfiguration = Object.assign({}, WEBHOOK_DEFAULTS, configuration);
        if (resolvedConfiguration.insecure && resolvedConfiguration.authorizer !== undefined) {
            throw new Error(
                `Webhook ${id} is specified as insecure, however an authorizer is configured for this webhook. ` +
                    "Either declare this webhook as secure by removing `insecure: true` property (recommended), " +
                    "or specify the webhook as insecure and remove the authorizer property altogether."
            );
        }
        if (!resolvedConfiguration.insecure && resolvedConfiguration.authorizer === undefined) {
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
                DetailType: resolvedConfiguration.eventType ?? "Webhook",
                Detail: "$request.body",
                Source: id,
                EventBusName: this.bus.eventBusName,
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
                (Fn.getAtt(provider.naming.getLambdaLogicalId(`${id}Authorizer`), "Arn") as unknown) as string
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

    commands(): Record<string, () => void | Promise<void>> {
        return {};
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            httpMethod: () => this.getHttpMethod(),
            url: () => this.getUrl(),
        };
    }

    references(): Record<string, Record<string, unknown>> {
        return {
            busName: this.referenceBusName(),
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

    private referenceBusName(): Record<string, unknown> {
        return this.provider.getCloudFormationReference(this.bus.eventBusName);
    }
}
