import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { FunctionEventType } from "aws-cdk-lib/aws-cloudfront";
import type { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import { redirectToMainDomain } from "../../classes/cloudfrontFunctions";
import { getCfnFunctionAssociations } from "../../utils/getDefaultCfnFunctionAssociations";
import { ensureNameMaxLength } from "../../utils/naming";
import type { CommonStaticWebsiteConfiguration } from "./abstracts/StaticWebsiteAbstract";
import { COMMON_STATIC_WEBSITE_DEFINITION, StaticWebsiteAbstract } from "./abstracts/StaticWebsiteAbstract";

export class SinglePageApp extends StaticWebsiteAbstract {
    public static type = "single-page-app";
    public static schema = COMMON_STATIC_WEBSITE_DEFINITION;

    constructor(
        scope: CdkConstruct,
        protected readonly id: string,
        protected readonly configuration: CommonStaticWebsiteConfiguration,
        protected readonly provider: AwsProvider
    ) {
        super(scope, id, configuration, provider);

        if (this.configuration.redirectToMainDomain === true) {
            const cfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
            const requestFunction = this.createRedirectRequestFunction();

            const defaultBehaviorFunctionAssociations = getCfnFunctionAssociations(cfnDistribution);

            cfnDistribution.addOverride("Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations", [
                ...defaultBehaviorFunctionAssociations,
                { EventType: FunctionEventType.VIEWER_REQUEST, FunctionARN: requestFunction.functionArn },
            ]);
        }
    }

    private createRedirectRequestFunction(): cloudfront.Function {
        const code = redirectToMainDomain(this.domains);

        const functionName = ensureNameMaxLength(
            `${this.provider.stackName}-${this.provider.region}-${this.id}-request`,
            64
        );

        return new cloudfront.Function(this, "RequestFunction", {
            functionName,
            code: cloudfront.FunctionCode.fromInline(code),
        });
    }
}
