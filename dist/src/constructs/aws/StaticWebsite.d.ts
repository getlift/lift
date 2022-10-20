import type { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import type { BucketProps } from "aws-cdk-lib/aws-s3";
import type { CommonStaticWebsiteConfiguration } from "./abstracts/StaticWebsiteAbstract";
import { StaticWebsiteAbstract } from "./abstracts/StaticWebsiteAbstract";
export declare class StaticWebsite extends StaticWebsiteAbstract {
    protected readonly id: string;
    protected readonly configuration: CommonStaticWebsiteConfiguration;
    protected readonly provider: AwsProvider;
    static type: string;
    static schema: {
        readonly type: "object";
        readonly properties: {
            readonly path: {
                readonly type: "string";
            };
            readonly domain: {
                readonly anyOf: readonly [{
                    readonly type: "string";
                }, {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                }];
            };
            readonly certificate: {
                readonly type: "string";
            };
            readonly security: {
                readonly type: "object";
                readonly properties: {
                    readonly allowIframe: {
                        readonly type: "boolean";
                    };
                };
                readonly additionalProperties: false;
            };
            readonly errorPage: {
                readonly type: "string";
            };
            readonly redirectToMainDomain: {
                readonly type: "boolean";
            };
        };
        readonly additionalProperties: false;
        readonly required: readonly ["path"];
    };
    constructor(scope: CdkConstruct, id: string, configuration: CommonStaticWebsiteConfiguration, provider: AwsProvider);
    private createRequestFunction;
    getBucketProps(): BucketProps;
}
