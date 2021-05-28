import { FromSchema } from 'json-schema-to-ts';
import ora from 'ora';
import path from 'path';
import { execSync } from 'child_process';
import Construct from '../Construct';
import NetlifyProvider from './NetlifyProvider';

export const NETLIFY_WEBSITE_DEFINITION = {
    type: 'object',
    properties: {
        type: { const: 'netlify/website' },
        name: { type: 'string' },
        path: { type: 'string' },
    },
    additionalProperties: false,
    required: ['name', 'path'],
} as const;

type Configuration = FromSchema<typeof NETLIFY_WEBSITE_DEFINITION>;

export class NetlifyWebsite implements Construct {
    // The constructor has promoted properties it is not useless
    // eslint-disable-next-line no-useless-constructor
    constructor(private provider: NetlifyProvider, private id: string, private configuration: Configuration) {}

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            url: this.getUrl.bind(this),
        };
    }

    commands(): Record<string, () => Promise<void>> {
        return {
            upload: async () => await this.upload(),
            dev: async () => {
                execSync('netlify dev', { stdio: 'inherit' });
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

    references(): Record<string, () => Record<string, unknown>> {
        return {};
    }

    async getUrl(): Promise<string | undefined> {
        const site = await this.provider.getSiteByName(this.configuration.name);

        return site ? site.url : undefined;
    }
}
