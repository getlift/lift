import { FromSchema } from 'json-schema-to-ts';
import ora from 'ora';
import path from 'path';
import { execSync } from 'child_process';
import Construct from '../Construct';
import NetlifyProvider from './NetlifyProvider';
import { log } from '../../utils/logger';

export const NETLIFY_WEBSITE_DEFINITION = {
    type: 'object',
    properties: {
        type: { const: 'netlify/website' },
        siteName: { type: 'string' },
        path: { type: 'string' },
        build: {
            type: 'object',
            properties: {
                script: { type: 'string' },
                path: { type: 'string' },
                environment: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                },
            },
            additionalProperties: false,
            required: ['script'],
        },
    },
    additionalProperties: false,
    required: ['siteName', 'path'],
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

    commands(): Record<string, () => void | Promise<void>> {
        return {
            deploy: async () => {
                this.build();
                await this.upload();
            },
            build: () => this.build(),
            upload: async () => await this.upload(),
            dev: async () => {
                execSync('netlify dev', { stdio: 'inherit' });
            },
        };
    }

    build(): void {
        if (this.configuration.build === undefined) return;

        let buildDir: string;
        if (this.configuration.build.path !== undefined) {
            buildDir = path.resolve(this.configuration.build.path);
        } else {
            buildDir = process.cwd();
        }

        log(`Building website '${this.id}': ${this.configuration.build.script}`);
        execSync(this.configuration.build.script, {
            cwd: buildDir,
            stdio: 'inherit',
            // Merge configured environment variables to existing environment variables
            env: Object.assign({}, process.env, this.configuration.build.environment),
        });
    }

    async upload(): Promise<void> {
        const siteId = await this.provider.getSiteIdFromName(this.configuration.siteName);

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
        const site = await this.provider.getSiteByName(this.configuration.siteName);

        return site ? site.url : undefined;
    }
}
