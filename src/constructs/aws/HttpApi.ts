import { CfnOutput } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2";
import { LambdaProxyIntegration } from "@aws-cdk/aws-apigatewayv2-integrations";
import { AwsComponent } from "./AwsComponent";
import { Function, FUNCTION_DEFINITION } from "./Function";
import { AwsProvider } from "./AwsProvider";

export const HTTP_API_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "http-api" },
        routes: {
            type: "object",
            additionalProperties: FUNCTION_DEFINITION,
        },
    },
    additionalProperties: false,
    required: ["type", "routes"],
} as const;

export class HttpApi extends AwsComponent<typeof HTTP_API_DEFINITION> {
    private readonly api: apigatewayv2.HttpApi;
    private readonly apiUrlOutput: CfnOutput;

    constructor(provider: AwsProvider, id: string, configuration: FromSchema<typeof HTTP_API_DEFINITION>) {
        super(provider, id, configuration);

        let defaultRoute: LambdaProxyIntegration | undefined = undefined;
        if ("*" in configuration.routes) {
            const handler = new Function(this.provider, "ApiHandler", configuration.routes["*"]);
            defaultRoute = new LambdaProxyIntegration({
                handler: handler.function,
            });
        }

        this.api = new apigatewayv2.HttpApi(this, "Api", {
            apiName: this.provider.stack.stackName + "-" + id,
            createDefaultStage: true,
            defaultIntegration: defaultRoute,
        });

        for (const [expression, handlerConfig] of Object.entries(configuration.routes)) {
            if (expression === "*") {
                continue;
            }
            const [methodString, path] = expression.split(" ");
            // TODO better validation
            const method = apigatewayv2.HttpMethod[methodString as apigatewayv2.HttpMethod];

            // TODO Unique ID for each handler (sub-constructs?)
            const handler = new Function(this.provider, "ApiHandler", handlerConfig);
            this.api.addRoutes({
                methods: [method],
                path: path,
                integration: new LambdaProxyIntegration({
                    handler: handler.function,
                }),
            });
        }

        // CloudFormation outputs
        this.apiUrlOutput = new CfnOutput(this, "ApiUrl", {
            description: `URL of the "${id}" API.`,
            value: this.api.url ?? "",
        });
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            url: () => this.getUrl(),
        };
    }

    commands(): Record<string, () => Promise<void>> {
        return {};
    }

    references(): Record<string, () => Record<string, unknown>> {
        return {
            queueArn: () => this.referenceUrl(),
        };
    }

    referenceUrl(): Record<string, unknown> {
        return this.getCloudFormationReference(this.api.url!);
    }

    async getUrl(): Promise<string | undefined> {
        return this.getOutputValue(this.apiUrlOutput);
    }
}
