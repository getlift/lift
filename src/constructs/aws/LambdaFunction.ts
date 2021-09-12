import * as lambda from "@aws-cdk/aws-lambda";
import type { Construct } from "@aws-cdk/core";
import { CfnOutput } from "@aws-cdk/core";
import type { FromSchema } from "json-schema-to-ts";
import type { ConstructInterface } from "@lift/constructs";
import type { AwsProvider } from "@lift/providers";

export const FUNCTION_DEFINITION = {
    type: "object",
    properties: {
        handler: { type: "string" },
        timeout: { type: "number" },
        runtime: { type: "string" },
        environment: {
            type: "object",
            additionalProperties: { type: "string" },
        },
    },
    additionalProperties: false,
    required: ["handler"],
} as const;
type Configuration = FromSchema<typeof FUNCTION_DEFINITION>;

export class LambdaFunction extends lambda.Function implements ConstructInterface {
    public static type = "function";
    public static schema = FUNCTION_DEFINITION;

    static create(provider: AwsProvider, id: string, configuration: Configuration): LambdaFunction {
        return new LambdaFunction(provider.stack, id, configuration, provider);
    }

    private readonly functionNameOutput: CfnOutput;

    constructor(
        scope: Construct,
        private readonly id: string,
        private readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        // TODO set options based on configuration
        super(scope, id, {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(process.cwd(), {
                exclude: ["serverless.yml", ".serverless/*"],
            }),
            handler: configuration.handler,
            environment: configuration.environment,
            role: provider.lambdaRole,
        });

        this.functionNameOutput = new CfnOutput(this, "FunctionName", {
            description: `Name of the "${id}" function.`,
            value: this.functionName,
        });
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            name: this.getFunctionName.bind(this),
        };
    }

    variables(): Record<string, unknown> {
        return {};
    }

    async getFunctionName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.functionNameOutput);
    }
}
