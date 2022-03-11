import * as cloudfront from "@aws-cdk/aws-cloudfront";
import { FunctionEventType } from "@aws-cdk/aws-cloudfront";
import type { Construct as CdkConstruct } from "@aws-cdk/core";
import type { AwsProvider } from "@lift/providers";
import type { FromSchema } from "json-schema-to-ts";
import { redirectToMainDomain } from "../../classes/cloudfrontFunctions";
import { getCfnFunctionAssociations } from "../../utils/getDefaultCfnFunctionAssociations";
import { COMMON_STATIC_WEBSITE_DEFINITION, StaticWebsiteAbstract } from "./abstracts/StaticWebsiteAbstract";

const STATIC_WEBSITE_DEFINITION = {
    type: "object",
    properties: {
        ...COMMON_STATIC_WEBSITE_DEFINITION.properties,
        redirectToMainDomain: { type: "boolean" },
    },
    additionalProperties: false,
    required: COMMON_STATIC_WEBSITE_DEFINITION.required,
} as const;

type Configuration = FromSchema<typeof STATIC_WEBSITE_DEFINITION>;
export class StaticWebsite extends StaticWebsiteAbstract {
    public static type = "static-website";
    public static schema = STATIC_WEBSITE_DEFINITION;

    constructor(
        scope: CdkConstruct,
        protected readonly id: string,
        protected readonly configuration: Configuration,
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
