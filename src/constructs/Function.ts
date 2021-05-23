import { Code, Function as LambdaFunction, Runtime } from "@aws-cdk/aws-lambda";
import { CfnOutput } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { AwsComponent } from "./AwsComponent";
import { AwsProvider } from "./Provider";

export const FUNCTION_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "function" },
        handler: { type: "string" },
        timeout: { type: "number" },
    },
    additionalProperties: false,
    required: ["handler"],
} as const;

export class Function extends AwsComponent<typeof FUNCTION_DEFINITION> {
    public readonly function: LambdaFunction;
    private readonly functionNameOutput: CfnOutput;

    constructor(provider: AwsProvider, id: string, configuration: FromSchema<typeof FUNCTION_DEFINITION>) {
        super(provider, id, configuration);

        // TODO set options based on configuration
        this.function = new LambdaFunction(this.cdkNode, "Function", {
            runtime: Runtime.NODEJS_14_X,
            code: Code.fromAsset(process.cwd()),
            handler: configuration.handler,
        });
        this.functionNameOutput = new CfnOutput(this.cdkNode, "FunctionName", {
            description: `Name of the "${id}" function.`,
            value: this.function.functionName,
        });
    }

    /**
     * serverless info
     *     function: complete-function-name
     */
    async infoOutput(): Promise<string | undefined> {
        return await this.getFunctionName();
    }

    exposedVariables(): Record<string, () => Record<string, unknown>> {
        return {};
    }

    async getFunctionName(): Promise<string | undefined> {
        return this.getOutputValue(this.functionNameOutput);
    }
}
