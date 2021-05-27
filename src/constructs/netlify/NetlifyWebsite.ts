import { FromSchema } from "json-schema-to-ts";
import * as child_process from "child_process";
import ora from "ora";
import path from "path";
import { Component } from "../Component";
import { NetlifyProvider } from "./NetlifyProvider";

export const NETLIFY_WEBSITE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "netlify/website" },
        name: { type: "string" },
        path: { type: "string" },
    },
    additionalProperties: false,
    required: ["name", "path"],
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

    get siteName(): string {
        return this.configuration.name;
    }

    get deployDir(): string {
        return this.configuration.path;
    }

    commands(): Record<string, () => Promise<void>> {
        return {
            upload: async () => await this.upload(),
            dev: async () => {
                child_process.execSync("netlify dev", { stdio: "inherit" });
            },
        };
    }

    async upload(): Promise<void> {
        const siteId = await this.provider.getSiteIdFromName(this.configuration.name);

        const progress = ora(`Deploying website '${this.id}' to Netlify`).start();
        try {
            const deployDir = path.resolve(this.configuration.path);
            await this.provider.netlify.deploy(siteId, deployDir);
        } catch (e) {
            progress.fail(`Failed deploying website '${this.id}' to Netlify`);
            throw e;
        }
        progress.succeed(`Website '${this.id}' deployed to Netlify`);
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
