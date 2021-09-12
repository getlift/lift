import type { FromSchema } from "json-schema-to-ts";
import ora from "ora";
import path from "path";
import { execSync } from "child_process";
import type { ConstructInterface } from "@lift/constructs";
import NetlifyApi from "@lift/constructs/netlify/NetlifyApi";
import type { ConstructCommands } from "@lift/constructs";
import { log } from "../../utils/logger";

const SCHEMA = {
    type: "object",
    properties: {
        siteName: { type: "string" },
        path: { type: "string" },
        build: {
            type: "object",
            properties: {
                script: { type: "string" },
                path: { type: "string" },
                environment: {
                    type: "object",
                    additionalProperties: { type: "string" },
                },
            },
            additionalProperties: false,
            required: ["script"],
        },
    },
    additionalProperties: false,
    required: ["siteName", "path"],
} as const;
type Configuration = FromSchema<typeof SCHEMA>;

export class NetlifyWebsite implements ConstructInterface {
    public static type = "netlify/website";
    public static schema = SCHEMA;
    public static commands: ConstructCommands = {
        deploy: {
            usage: "Build and upload files",
            handler: NetlifyWebsite.prototype.postDeploy,
        },
        build: {
            usage: "Build",
            handler: NetlifyWebsite.prototype.build,
        },
        upload: {
            usage: "Upload without building",
            handler: NetlifyWebsite.prototype.upload,
        },
        dev: {
            usage: "Develop locally",
            handler: () => {
                execSync("netlify dev", { stdio: "inherit" });
            },
        },
    };

    static create(id: string, configuration: Configuration): NetlifyWebsite {
        return new this(id, configuration);
    }

    private netlify: NetlifyApi;

    // The constructor has promoted properties it is not useless
    // eslint-disable-next-line no-useless-constructor
    constructor(private id: string, private configuration: Configuration) {
        this.netlify = new NetlifyApi();
    }

    async postDeploy(): Promise<void> {
        // TODO auto-create websites
        this.build();
        await this.upload();
    }

    async preRemove(): Promise<void> {
        // TODO
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            url: this.getUrl.bind(this),
        };
    }

    build(): void {
        if (this.configuration.build === undefined) {
            return;
        }

        let buildDir: string;
        if (this.configuration.build.path !== undefined) {
            buildDir = path.resolve(this.configuration.build.path);
        } else {
            buildDir = process.cwd();
        }

        log(`Building website '${this.id}': ${this.configuration.build.script}`);
        execSync(this.configuration.build.script, {
            cwd: buildDir,
            stdio: "inherit",
            // Merge configured environment variables to existing environment variables
            env: Object.assign({}, process.env, this.configuration.build.environment),
        });
    }

    async upload(): Promise<void> {
        const siteId = await this.netlify.getSiteIdFromName(this.configuration.siteName);

        const progress = ora(`Deploying website '${this.id}' to Netlify`).start();
        try {
            const deployDir = path.resolve(this.configuration.path);
            await this.netlify.deploy(siteId, deployDir);
        } catch (e) {
            progress.fail(`Failed deploying website '${this.id}' to Netlify`);
            throw e;
        }
        progress.succeed(`Website '${this.id}' deployed to Netlify`);
    }

    async getUrl(): Promise<string | undefined> {
        const site = await this.netlify.getSiteByName(this.configuration.siteName);

        return site ? site.url : undefined;
    }
}
