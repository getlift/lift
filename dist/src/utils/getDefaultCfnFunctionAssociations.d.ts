import type { CfnDistribution } from "aws-cdk-lib/aws-cloudfront";
interface CfnFunctionAssociation {
    EventType: string;
    FunctionARN: string;
}
export declare function getCfnFunctionAssociations(distribution: CfnDistribution): CfnFunctionAssociation[];
export {};
