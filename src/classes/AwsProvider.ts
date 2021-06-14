import { EventBus } from "@aws-cdk/aws-events";
import { App, Construct as CdkConstruct, CfnOutput, Stack } from "@aws-cdk/core";
import { merge } from "lodash";
import { FromSchema } from "json-schema-to-ts";
import { getStackOutput } from "../CloudFormation";
import { awsRequest } from "./aws";
import { CloudformationTemplate, Provider as LegacyAwsProvider, Serverless } from "../types/serverless";
import Construct from "./Construct";
import { constructs } from "../constructs";

type Constructor<N extends keyof typeof constructs> = new (
    scope: CdkConstruct,
    id: string,
    configuration: FromSchema<typeof constructs[N]["schema"]>,
    provider: AwsProvider
) => InstanceType<typeof constructs[N]["class"]>;

type Toto = Constructor<"storage">;

export default class AwsProvider {
    public readonly region: string;
    public readonly stackName: string;
    private bus: EventBus | undefined;
    private readonly app: App;
    private readonly stack: Stack;
    private readonly legacyProvider: LegacyAwsProvider;
    public naming: { getStackName: () => string; getLambdaLogicalId: (functionName: string) => string };

    constructor(private readonly serverless: Serverless) {
        this.stackName = serverless.getProvider("aws").naming.getStackName();

        this.legacyProvider = serverless.getProvider("aws");
        this.naming = this.legacyProvider.naming;
        this.region = serverless.getProvider("aws").getRegion();
        this.app = new App();
        this.stack = new Stack(this.app);
    }

    registerConstruct<N extends keyof typeof constructs>(
        id: string,
        configuration: FromSchema<typeof constructs[N]["schema"]> & { type: N }
    ): Construct {
        const type = configuration.type;
        const construct = constructs[type].class;

        return new construct(this.app, id, configuration, this);
    }

    appendCloudformationResources(): void {
        merge(this.serverless.service, {
            resources: this.app.synth().getStackByName(this.stack.stackName).template as CloudformationTemplate,
        });
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
