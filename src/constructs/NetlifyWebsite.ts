import { FromSchema } from "json-schema-to-ts";
import { Component } from "./Component";
import { NetlifyProvider } from "./NetlifyProvider";

export const NETLIFY_WEBSITE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "netlify/website" },
        siteId: { type: "string" },
        path: { type: "string" },
    },
    additionalProperties: false,
    required: ["siteId", "path"],
} as const;

export class NetlifyWebsite extends Component<typeof NETLIFY_WEBSITE_DEFINITION> {
    protected readonly provider: NetlifyProvider;

    protected constructor(
        provider: NetlifyProvider,
        id: string,
        configuration: FromSchema<typeof NETLIFY_WEBSITE_DEFINITION>
    ) {
        super(provider, id, configuration);

        this.provider = provider;
    }

    get siteId(): string {
        return this.configuration.siteId;
    }

    get deployDir(): string {
        return this.configuration.path;
    }

    infoOutput(): Promise<string | undefined> {
        return Promise.resolve(undefined);
    }

    references(): Record<string, () => Record<string, unknown>> {
        return {};
    }

    variables(): Record<string, () => Promise<string | undefined>> {
        return {};
    }
}
