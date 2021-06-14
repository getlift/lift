import { App, CfnOutput, Stack } from "@aws-cdk/core";
import { get, merge } from "lodash";
import { getStackOutput } from "../CloudFormation";
import { CloudformationTemplate, Provider as LegacyAwsProvider, Serverless } from "../types/serverless";
import { awsRequest } from "./aws";
import { constructs } from "../constructs";
import Construct from "./Construct";

export default class AwsProvider {
    private readonly app: App;
    public readonly stack: Stack;
    public readonly region: string;
    public readonly stackName: string;
    private readonly legacyProvider: LegacyAwsProvider;
    public naming: { getStackName: () => string; getLambdaLogicalId: (functionName: string) => string };

    constructor(private readonly serverless: Serverless) {
        this.app = new App();
        this.stack = new Stack(this.app);
        this.serverless.stack = this.stack;
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

    registerConstruct<T extends keyof typeof constructs, C extends Construct>(id: string): C {
        const constructInputConfiguration = get(this.serverless.configurationInput, `constructs.${id}`, {}) as {
            type: T;
        };
        const construct = constructs[constructInputConfiguration.type].class;

        // @ts-expect-error In order to have correct typings, an abstract class should be used instead of interface
        return new construct(this.stack, id, constructInputConfiguration, this);
    }

    appendCloudformationResources(): void {
        merge(this.serverless.service, {
            resources: this.app.synth().getStackByName(this.stack.stackName).template as CloudformationTemplate,
        });
    }
}
