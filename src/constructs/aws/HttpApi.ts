import type { Construct } from "@aws-cdk/core";
import { CfnOutput } from "@aws-cdk/core";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import { FUNCTION_DEFINITION, LambdaFunction } from "@lift/constructs/aws/LambdaFunction";
import { AwsConstruct } from "@lift/constructs/abstracts";
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2";
import { LambdaProxyIntegration } from "@aws-cdk/aws-apigatewayv2-integrations";

const SCHEMA = {
    type: "object",
    properties: {
        routes: {
            type: "object",
            additionalProperties: FUNCTION_DEFINITION,
        },
    },
    additionalProperties: false,
    required: ["routes"],
} as const;
type Configuration = FromSchema<typeof SCHEMA>;

export class HttpApi extends AwsConstruct {
    public static type = "http-api";
    public static schema = SCHEMA;

    private readonly api: apigatewayv2.HttpApi;
    private readonly urlOutput: CfnOutput;

    constructor(
        scope: Construct,
        private readonly id: string,
        private readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);

        let defaultRoute: LambdaProxyIntegration | undefined;
        if ("*" in configuration.routes) {
            const handler = new LambdaFunction(this, "ApiHandler", configuration.routes["*"], provider);
            defaultRoute = new LambdaProxyIntegration({
                handler,
            });
        }

        this.api = new apigatewayv2.HttpApi(this, "Api", {
            apiName: `${this.provider.stack.stackName}-${id}`,
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
            const handler = new LambdaFunction(this, "ApiHandler", handlerConfig, this.provider);
            this.api.addRoutes({
                methods: [method],
                path,
                integration: new LambdaProxyIntegration({
                    handler,
                }),
            });
        }

        // CloudFormation outputs
        this.urlOutput = new CfnOutput(this, "ApiUrl", {
            description: `URL of the "${id}" API.`,
            value: this.api.url ?? "",
        });
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            url: () => this.getUrl(),
        };
    }

    variables(): Record<string, unknown> {
        return {
            url: this.api.url,
        };
    }

    async getUrl(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.urlOutput);
    }
}
