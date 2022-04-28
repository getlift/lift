import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { FunctionEventType } from "aws-cdk-lib/aws-cloudfront";
import type { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import { redirectToMainDomain } from "../../classes/cloudfrontFunctions";
import { getCfnFunctionAssociations } from "../../utils/getDefaultCfnFunctionAssociations";
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

        const cfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
        const requestFunction = this.createRequestFunction();

        const defaultBehaviorFunctionAssociations = getCfnFunctionAssociations(cfnDistribution);

        cfnDistribution.addOverride("Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations", [
            ...defaultBehaviorFunctionAssociations,
            { EventType: FunctionEventType.VIEWER_REQUEST, FunctionARN: requestFunction.functionArn },
        ]);
    }

    private createRequestFunction(): cloudfront.Function {
        let additionalCode = "";

        if (this.configuration.redirectToMainDomain === true) {
            additionalCode += redirectToMainDomain(this.domains);
        }

        /**
         * CloudFront function that redirects nested paths to /index.html and
         * let static files pass.
         *
         * Files extensions list taken from: https://docs.aws.amazon.com/amplify/latest/userguide/redirects.html#redirects-for-single-page-web-apps-spa
         * Add xml as well
         */
        const code = `var REDIRECT_REGEX = /^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|xml)$)([^.]+$)/;

function handler(event) {
    var uri = event.request.uri;
    var request = event.request;
    var isUriToRedirect = REDIRECT_REGEX.test(uri);

    if (isUriToRedirect) {
        request.uri = "/index.html";
    }${additionalCode}

    return event.request;
}`;

        return new cloudfront.Function(this, "RequestFunction", {
            functionName: `${this.provider.stackName}-${this.provider.region}-${this.id}-request`,
            code: cloudfront.FunctionCode.fromInline(code),
        });
    }
}
