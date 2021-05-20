import { Code, Function as LambdaFunction, Runtime } from "@aws-cdk/aws-lambda";
import { CfnOutput, Stack } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { AwsComponent } from "./AwsComponent";
import type { Serverless } from "../types/serverless";

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
    private readonly function: LambdaFunction;
    private readonly functionNameOutput: CfnOutput;

    constructor(
        serverless: Serverless,
        id: string,
        configuration: FromSchema<typeof FUNCTION_DEFINITION>,
        stack?: Stack
    ) {
        super(serverless, id, FUNCTION_DEFINITION, configuration, stack);

        this.function = new LambdaFunction(this.stack, "Function", {
            runtime: Runtime.NODEJS_14_X,
            code: Code.fromAsset(process.cwd()),
            handler: configuration.handler,
        });
        this.functionNameOutput = new CfnOutput(this.stack, "FunctionName", {
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

    variables(): Record<string, () => Promise<string | undefined>> {
        return {
            name: this.getFunctionName.bind(this),
        };
    }

    async getFunctionName(): Promise<string | undefined> {
        return this.getOutputValue(this.functionNameOutput);
    }
}
