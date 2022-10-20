import type { CfnOutput } from "aws-cdk-lib";
import type { AwsProvider } from "@lift/providers";
export declare function getStackOutput(aws: AwsProvider, output: CfnOutput): Promise<string | undefined>;
export declare class PolicyStatement {
    Effect: string;
    Action: string | string[];
    Resource: string | Array<unknown>;
    constructor(Action: string | string[], Resource: string | Array<unknown>);
}
