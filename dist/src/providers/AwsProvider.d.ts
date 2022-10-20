import type { CfnOutput } from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import type { AwsCfInstruction, AwsLambdaVpcConfig } from "@serverless/typescript";
import type { ProviderInterface } from "@lift/providers";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import type { Serverless } from "../types/serverless";
export declare class AwsProvider implements ProviderInterface {
    private readonly serverless;
    static type: string;
    static schema: {
        readonly type: "object";
        readonly properties: {};
        readonly additionalProperties: false;
    };
    private static readonly constructClasses;
    static registerConstructs(...constructClasses: StaticConstructInterface[]): void;
    static getConstructClass(type: string): StaticConstructInterface | undefined;
    static getAllConstructClasses(): StaticConstructInterface[];
    static create(serverless: Serverless): ProviderInterface;
    private readonly app;
    readonly stack: Stack;
    readonly region: string;
    readonly stackName: string;
    private readonly legacyProvider;
    naming: {
        getStackName: () => string;
        getLambdaLogicalId: (functionName: string) => string;
        getRestApiLogicalId: () => string;
        getHttpApiLogicalId: () => string;
    };
    constructor(serverless: Serverless);
    createConstruct(type: string, id: string): ConstructInterface;
    addFunction(functionName: string, functionConfig: unknown): void;
    /**
     * @internal
     */
    setVpcConfig(securityGroups: AwsCfInstruction[], subnets: AwsCfInstruction[]): void;
    /**
     * This function can be used by other constructs to reference
     * global subnets or security groups in their resources
     *
     * @internal
     */
    getVpcConfig(): AwsLambdaVpcConfig | null;
    /**
     * Resolves the value of a CloudFormation stack output.
     */
    getStackOutput(output: CfnOutput): Promise<string | undefined>;
    /**
     * Send a request to the AWS API.
     */
    request<Input, Output>(service: string, method: string, params: Input): Promise<Output>;
    appendCloudformationResources(): void;
}
