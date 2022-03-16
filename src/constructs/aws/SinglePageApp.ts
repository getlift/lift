import * as cloudfront from "@aws-cdk/aws-cloudfront";
import { FunctionEventType } from "@aws-cdk/aws-cloudfront";
import type { Construct as CdkConstruct } from "@aws-cdk/core";
import type { AwsProvider } from "@lift/providers";
import type { FromSchema } from "json-schema-to-ts";
import { omit } from "lodash";
import { getCfnFunctionAssociations } from "../../utils/getDefaultCfnFunctionAssociations";
import { COMMON_STATIC_WEBSITE_DEFINITION, StaticWebsiteAbstract } from "./abstracts/StaticWebsiteAbstract";

const SINGLE_PAGE_APP_DEFINITION = {
    type: "object",
    properties: omit(COMMON_STATIC_WEBSITE_DEFINITION.properties, ["redirectToMainDomain"]),
    additionalProperties: false,
    required: COMMON_STATIC_WEBSITE_DEFINITION.required,
} as const;

type Configuration = FromSchema<typeof SINGLE_PAGE_APP_DEFINITION>;

export class SinglePageApp extends StaticWebsiteAbstract {
    public static type = "single-page-app";
    public static schema = SINGLE_PAGE_APP_DEFINITION;

    constructor(
        scope: CdkConstruct,
        protected readonly id: string,
        protected readonly configuration: Configuration,
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
        /**
         * CloudFront function that redirects nested paths to /index.html and
         * let static files pass.
         *
         * Files extensions list taken from: https://docs.aws.amazon.com/amplify/latest/userguide/redirects.html#redirects-for-single-page-web-apps-spa
         */
        const code = `var REDIRECT_REGEX = /^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/;

function handler(event) {
    var uri = event.request.uri;
    var isUriToRedirect = REDIRECT_REGEX.test(uri);

    if (isUriToRedirect) event.request.uri = "/index.html";

    return event.request;
}`;

        return new cloudfront.Function(this, "RequestFunction", {
            functionName: `${this.provider.stackName}-${this.provider.region}-${this.id}-request`,
            code: cloudfront.FunctionCode.fromInline(code),
        });
    }
}
