import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { FunctionEventType } from "aws-cdk-lib/aws-cloudfront";
import type { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import { redirectToMainDomain } from "../../classes/cloudfrontFunctions";
import { getCfnFunctionAssociations } from "../../utils/getDefaultCfnFunctionAssociations";
import type { CommonStaticWebsiteConfiguration } from "./abstracts/StaticWebsiteAbstract";
import { COMMON_STATIC_WEBSITE_DEFINITION, StaticWebsiteAbstract } from "./abstracts/StaticWebsiteAbstract";

export class StaticWebsite extends StaticWebsiteAbstract {
    public static type = "static-website";
    public static schema = COMMON_STATIC_WEBSITE_DEFINITION;

    constructor(
        scope: CdkConstruct,
        protected readonly id: string,
        protected readonly configuration: CommonStaticWebsiteConfiguration,
        protected readonly provider: AwsProvider
    ) {
        super(scope, id, configuration, provider);

        const cfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
        const requestFunction = this.createRequestFunction();

        if (requestFunction === null) {
            return;
        }

        const defaultBehaviorFunctionAssociations = getCfnFunctionAssociations(cfnDistribution);

        cfnDistribution.addOverride("Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations", [
            ...defaultBehaviorFunctionAssociations,
            { EventType: FunctionEventType.VIEWER_REQUEST, FunctionARN: requestFunction.functionArn },
        ]);
    }

    private createRequestFunction(): cloudfront.Function | null {
        let additionalCode = "";

        if (this.configuration.redirectToMainDomain === true) {
            additionalCode += redirectToMainDomain(this.domains);
        }

        if (additionalCode === "") {
            return null;
        }

        const code = `function handler(event) {
    var request = event.request;${additionalCode}
    return request;
}`;

        return new cloudfront.Function(this, "RequestFunction", {
            functionName: `${this.provider.stackName}-${this.provider.region}-${this.id}-request`,
            code: cloudfront.FunctionCode.fromInline(code),
        });
    }
}
