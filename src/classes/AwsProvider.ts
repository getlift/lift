import { EventBus } from "@aws-cdk/aws-events";
import { CfnOutput, Stack } from "@aws-cdk/core";
import { getStackOutput } from "../CloudFormation";
import { Provider as LegacyAwsProvider, Serverless } from "../types/serverless";
import { awsRequest } from "./aws";

export default class AwsProvider {
    public readonly region: string;
    public readonly stackName: string;
    private bus: EventBus | undefined;
    private readonly legacyProvider: LegacyAwsProvider;
    public naming: { getStackName: () => string; getLambdaLogicalId: (functionName: string) => string };

    constructor(private readonly serverless: Serverless, public readonly stack: Stack) {
        this.stackName = serverless.getProvider("aws").naming.getStackName();

        this.legacyProvider = serverless.getProvider("aws");
        this.naming = this.legacyProvider.naming;
        this.region = serverless.getProvider("aws").getRegion();
    }

    addFunction(functionName: string, functionConfig: unknown): void {
        Object.assign(this.serverless.service.functions, {
            [functionName]: functionConfig,
        });
    }

    /**
     * Resolves the value of a CloudFormation stack output.
     */
    async getStackOutput(output: CfnOutput): Promise<string | undefined> {
        return getStackOutput(this, output);
    }

    /**
     * Returns a CloudFormation intrinsic function, like Fn::Ref, GetAtt, etc.
     */
    getCloudFormationReference(value: string): Record<string, unknown> {
        return Stack.of(this.stack).resolve(value) as Record<string, unknown>;
    }

    /**
     * Send a request to the AWS API.
     */
    request<Input, Output>(service: string, method: string, params: Input): Promise<Output> {
        return awsRequest<Input, Output>(params, service, method, this.legacyProvider);
    }

    getProviderBus(): EventBus {
        if (!this.bus) {
            this.bus = new EventBus(this.stack, "Bus");
        }

        return this.bus;
    }
}
