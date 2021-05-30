import { CfnOutput, Construct } from '@aws-cdk/core';
import { FromSchema } from 'json-schema-to-ts';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2';
import { LambdaProxyIntegration } from '@aws-cdk/aws-apigatewayv2-integrations';
import AwsConstruct from './AwsConstruct';
import { Function, FUNCTION_DEFINITION } from './Function';
import AwsProvider from './AwsProvider';

export const HTTP_API_DEFINITION = {
    type: 'object',
    properties: {
        type: { const: 'http-api' },
        routes: {
            type: 'object',
            additionalProperties: FUNCTION_DEFINITION,
        },
    },
    additionalProperties: false,
    required: ['type', 'routes'],
} as const;

export class HttpApi extends Construct implements AwsConstruct {
    private readonly api: apigatewayv2.HttpApi;
    private readonly urlOutput: CfnOutput;

    constructor(
        scope: Construct,
        private readonly provider: AwsProvider,
        id: string,
        configuration: FromSchema<typeof HTTP_API_DEFINITION>
    ) {
        super(scope, id);

        let defaultRoute: LambdaProxyIntegration | undefined;
        if ('*' in configuration.routes) {
            const handler = new Function(this, provider, 'ApiHandler', configuration.routes['*']);
            defaultRoute = new LambdaProxyIntegration({
                handler,
            });
        }

        this.api = new apigatewayv2.HttpApi(this, 'Api', {
            apiName: `${this.provider.stack.stackName}-${id}`,
            createDefaultStage: true,
            defaultIntegration: defaultRoute,
        });

        for (const [expression, handlerConfig] of Object.entries(configuration.routes)) {
            if (expression === '*') {
                continue;
            }
            const [methodString, path] = expression.split(' ');
            // TODO better validation
            const method = apigatewayv2.HttpMethod[methodString as apigatewayv2.HttpMethod];

            // TODO Unique ID for each handler (sub-constructs?)
            const handler = new Function(this, this.provider, 'ApiHandler', handlerConfig);
            this.api.addRoutes({
                methods: [method],
                path,
                integration: new LambdaProxyIntegration({
                    handler,
                }),
            });
        }

        // CloudFormation outputs
        this.urlOutput = new CfnOutput(this, 'ApiUrl', {
            description: `URL of the "${id}" API.`,
            value: this.api.url ?? '',
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

    references(): Record<string, string> {
        return {
            url: this.api.url!,
        };
    }

    async getUrl(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.urlOutput);
    }
}
