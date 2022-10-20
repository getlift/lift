import type { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import type { CommonStaticWebsiteConfiguration } from "./abstracts/StaticWebsiteAbstract";
import { StaticWebsiteAbstract } from "./abstracts/StaticWebsiteAbstract";
export declare class SinglePageApp extends StaticWebsiteAbstract {
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
                        readonly type: "boolean"; /**
                         * CloudFront function that redirects nested paths to /index.html and
                         * let static files pass.
                         *
                         * Files extensions list taken from: https://docs.aws.amazon.com/amplify/latest/userguide/redirects.html#redirects-for-single-page-web-apps-spa
                         * Add pdf and xml as well
                         */
                    }; /**
                     * CloudFront function that redirects nested paths to /index.html and
                     * let static files pass.
                     *
                     * Files extensions list taken from: https://docs.aws.amazon.com/amplify/latest/userguide/redirects.html#redirects-for-single-page-web-apps-spa
                     * Add pdf and xml as well
                     */
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
}
