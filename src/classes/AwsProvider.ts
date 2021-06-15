import { App, CfnOutput, Stack } from "@aws-cdk/core";
import { get, merge } from "lodash";
import { getStackOutput } from "../CloudFormation";
import { Constructs } from "../constructs";
import { CloudformationTemplate, Provider as LegacyAwsProvider, Serverless } from "../types/serverless";
import { awsRequest } from "./aws";
import { AwsConstruct } from ".";

export class AwsProvider {
    private readonly app: App;
    private readonly stack: Stack;
    public readonly region: string;
    public readonly stackName: string;
    private readonly legacyProvider: LegacyAwsProvider;
    public naming: { getStackName: () => string; getLambdaLogicalId: (functionName: string) => string };

    constructor(private readonly serverless: Serverless) {
        this.app = new App();
        this.stack = new Stack(this.app);
        serverless.stack = this.stack;
        this.stackName = serverless.getProvider("aws").naming.getStackName();

        this.legacyProvider = serverless.getProvider("aws");
        this.naming = this.legacyProvider.naming;
        this.region = serverless.getProvider("aws").getRegion();
    }

    create(type: string, id: string): AwsConstruct<Record<string, unknown>> {
        const configuration = get(this.serverless.configurationInput.constructs, id, {});
        for (const Construct of Object.values(Constructs)) {
            if (Construct.type === type) {
                return Construct.create(this.stack, id, configuration, this);
            }
        }
        throw new Error(`Construct ${id} has unsupported construct type: ${type}`);
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

    appendCloudformationResources(): void {
        merge(this.serverless.service, {
            resources: this.app.synth().getStackByName(this.stack.stackName).template as CloudformationTemplate,
        });
    }
}
