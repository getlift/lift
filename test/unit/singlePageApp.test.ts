import { get } from "lodash";
import * as sinon from "sinon";
import { baseConfig, runServerless } from "../utils/runServerless";

describe("single page app", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("should define a request function that redirects nested uris to index.html", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "single-page-app",
                        path: ".",
                        domain: ["www.example.com", "example.com"],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                    },
                },
            }),
        });
        const cfDistributionLogicalId = computeLogicalId("landing", "CDN");
        const requestFunction = computeLogicalId("landing", "RequestFunction");
        const responseFunction = computeLogicalId("landing", "ResponseFunction");
        expect(cfTemplate.Resources[requestFunction]).toMatchInlineSnapshot(`
            Object {
              "Properties": Object {
                "AutoPublish": true,
                "FunctionCode": "var REDIRECT_REGEX = /^[^.]+$|\\\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|xml)$)([^.]+$)/;

            function handler(event) {
                var uri = event.request.uri;
                var request = event.request;
                var isUriToRedirect = REDIRECT_REGEX.test(uri);

                if (isUriToRedirect) {
                    request.uri = \\"/index.html\\";
                }

                return event.request;
            }",
                "FunctionConfig": Object {
                  "Comment": "app-dev-us-east-1-landing-request",
                  "Runtime": "cloudfront-js-1.0",
                },
                "Name": "app-dev-us-east-1-landing-request",
              },
              "Type": "AWS::CloudFront::Function",
            }
        `);

        expect(
            get(
                cfTemplate.Resources[cfDistributionLogicalId],
                "Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations"
            )
        ).toMatchInlineSnapshot(`
            Array [
              Object {
                "EventType": "viewer-response",
                "FunctionARN": Object {
                  "Fn::GetAtt": Array [
                    "${responseFunction}",
                    "FunctionARN",
                  ],
                },
              },
              Object {
                "EventType": "viewer-request",
                "FunctionARN": Object {
                  "Fn::GetAtt": Array [
                    "${requestFunction}",
                    "FunctionARN",
                  ],
                },
              },
            ]
        `);
    });

    it("should allow to redirect to the main domain", async () => {
        const { cfTemplate, computeLogicalId } = await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    landing: {
                        type: "single-page-app",
                        path: ".",
                        domain: ["www.example.com", "example.com"],
                        certificate:
                            "arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123",
                        redirectToMainDomain: true,
                    },
                },
            }),
        });
        const requestFunction = computeLogicalId("landing", "RequestFunction");
        expect(cfTemplate.Resources[requestFunction].Properties.FunctionCode).toMatchInlineSnapshot(`
            "var REDIRECT_REGEX = /^[^.]+$|\\\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|xml)$)([^.]+$)/;

            function handler(event) {
                var uri = event.request.uri;
                var request = event.request;
                var isUriToRedirect = REDIRECT_REGEX.test(uri);

                if (isUriToRedirect) {
                    request.uri = \\"/index.html\\";
                }
                if (request.headers[\\"host\\"].value !== \\"www.example.com\\") {
                    return {
                        statusCode: 301,
                        statusDescription: \\"Moved Permanently\\",
                        headers: {
                            location: {
                                value: \\"https://www.example.com\\" + request.uri
                            }
                        }
                    };
                }

                return event.request;
            }"
        `);
    });
});
