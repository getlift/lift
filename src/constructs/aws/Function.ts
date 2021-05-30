import * as lambda from '@aws-cdk/aws-lambda';
import { CfnOutput, Construct } from '@aws-cdk/core';
import { FromSchema } from 'json-schema-to-ts';
import AwsConstruct from './AwsConstruct';
import AwsProvider from './AwsProvider';

export const FUNCTION_DEFINITION = {
    type: 'object',
    properties: {
        type: { const: 'function' },
        handler: { type: 'string' },
        timeout: { type: 'number' },
        runtime: { type: 'string' },
        environment: {
            type: 'object',
            additionalProperties: { type: 'string' },
        },
    },
    additionalProperties: false,
    required: ['type', 'handler'],
} as const;

export class Function extends lambda.Function implements AwsConstruct {
    private readonly functionNameOutput: CfnOutput;

    constructor(
        scope: Construct,
        private provider: AwsProvider,
        private id: string,
        private configuration: FromSchema<typeof FUNCTION_DEFINITION>
    ) {
        // TODO set options based on configuration
        super(scope, id, {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(process.cwd()),
            handler: configuration.handler,
            environment: configuration.environment,
            role: provider.lambdaRole,
        });

        this.functionNameOutput = new CfnOutput(this, 'FunctionName', {
            description: `Name of the "${id}" function.`,
            value: this.functionName,
        });
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            name: this.getFunctionName.bind(this),
        };
    }

    commands(): Record<string, () => Promise<void>> {
        return {};
    }

    references(): Record<string, string> {
        return {};
    }

    async getFunctionName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.functionNameOutput);
    }
}
