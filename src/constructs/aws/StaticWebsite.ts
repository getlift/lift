import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { FunctionEventType } from "aws-cdk-lib/aws-cloudfront";
import type { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import type { BucketProps } from "aws-cdk-lib/aws-s3";
import { RemovalPolicy } from "aws-cdk-lib";
import { redirectToMainDomain } from "../../classes/cloudfrontFunctions";
import { getCfnFunctionAssociations } from "../../utils/getDefaultCfnFunctionAssociations";
import { ensureNameMaxLength } from "../../utils/naming";
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

        const functionName = ensureNameMaxLength(
            `${this.provider.stackName}-${this.provider.region}-${this.id}-request`,
            64
        );

        return new cloudfront.Function(this, "RequestFunction", {
            functionName,
            code: cloudfront.FunctionCode.fromInline(code),
        });
    }

    getBucketProps(): BucketProps {
        return {
            // Enable static website hosting
            websiteIndexDocument: this.indexPath(),
            websiteErrorDocument: this.errorPath(),
            // public read access is required when enabling static website hosting
            publicReadAccess: this.configuration.publicReadAccess ?? false,
            // For a static website, the content is code that should be versioned elsewhere
            removalPolicy: RemovalPolicy.DESTROY,
        };
    }
}
