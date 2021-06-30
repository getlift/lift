import type { Construct as CdkConstruct } from "@aws-cdk/core/lib/construct-compat";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import { StaticWebsite } from "@lift/constructs/aws/index";
import type { ConstructCommands } from "@lift/constructs/StaticConstructInterface";
import { merge } from "lodash";
import { spawn } from "child_process";
import { log } from "../../utils/logger";

const SCHEMA = {
    type: "object",
    properties: {
        domain: {
            anyOf: [
                { type: "string" },
                {
                    type: "array",
                    items: { type: "string" },
                },
            ],
        },
        certificate: { type: "string" },
        security: {
            type: "object",
            properties: {
                allowIframe: { type: "boolean" },
            },
            additionalProperties: false,
        },
    },
    additionalProperties: false,
} as const;

type Configuration = FromSchema<typeof SCHEMA>;

export class ReactWebsite extends StaticWebsite {
    public static type = "react-website";
    public static schema = SCHEMA;
    public static commands: ConstructCommands = merge(StaticWebsite.commands, {
        build: {
            usage: "Build the website with 'npm run build'.",
            handler: ReactWebsite.prototype.build,
        },
        dev: {
            usage: "Run the website locally with 'npm start'.",
            handler: ReactWebsite.prototype.dev,
        },
    });

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, provider: AwsProvider) {
        const websiteConfiguration = Object.assign(
            {},
            {
                path: "build",
            },
            configuration
        );

        super(scope, id, websiteConfiguration, provider);
    }

    preDeploy(): void {
        this.build();
    }

    build(): void {
        log(`Building '${this.id}' with 'npm run build'`);
        spawn("npm", ["run", "build"], {
            stdio: "inherit",
        });
    }

    dev(): void {
        log(`Running 'npm start'`);
        spawn("npm", ["start"], {
            stdio: "inherit",
        });
    }
}
