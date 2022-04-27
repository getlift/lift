import type { CfnDistribution } from "aws-cdk-lib/aws-cloudfront";

interface CfnFunctionAssociation {
    EventType: string;
    FunctionARN: string;
}

function cdkFunctionAssociationToCfnFunctionAssociation({
    eventType,
    functionArn,
}: CfnDistribution.FunctionAssociationProperty): CfnFunctionAssociation {
    if (eventType === undefined || functionArn === undefined) {
        throw new Error("eventType and functionArn must be defined");
    }

    return {
        EventType: eventType,
        FunctionARN: functionArn,
    };
}

export function getCfnFunctionAssociations(distribution: CfnDistribution): CfnFunctionAssociation[] {
    const defaultBehavior = (distribution.distributionConfig as CfnDistribution.DistributionConfigProperty)
        .defaultCacheBehavior as CfnDistribution.DefaultCacheBehaviorProperty;

    return (defaultBehavior.functionAssociations as Array<CfnDistribution.FunctionAssociationProperty>).map(
        cdkFunctionAssociationToCfnFunctionAssociation
    );
}
