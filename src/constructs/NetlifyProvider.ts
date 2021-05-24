import NetlifyAPI from "netlify";
import * as fs from "fs";
import * as path from "path";
import ora from "ora";
import { NetlifyWebsite } from "./NetlifyWebsite";
import { Provider } from "./Provider";

export class NetlifyProvider extends Provider<NetlifyWebsite> {
    async deploy(): Promise<void> {
        if (Object.values(this.components).length === 0) {
            return;
        }

        const apiToken = this.readApiToken();
        const client = new NetlifyAPI(apiToken);
        const existingSites = await client.listSites();

        for (const [id, component] of Object.entries(this.components)) {
            const siteName = component.siteName;
            const site = existingSites.find((netlifySite) => netlifySite.name === siteName);
            if (site === undefined) {
                throw new Error(
                    `Couldn't find a site named '${siteName}' in the Netlify account. Automatically creating a Netlify website is not supported yet.`
                );
            }

            const progress = ora(`Deploying website '${id}' to Netlify`).start();
            try {
                const deployDir = path.resolve(component.deployDir);
                await client.deploy(site.id, deployDir);
            } catch (e) {
                progress.fail(`Failed deploying website '${id}' to Netlify`);
                throw e;
            }
            progress.succeed(`Website '${id}' deployed to Netlify`);
        }
    }

    async remove(): Promise<void> {
        // TODO
    }

    private readApiToken(): string {
        // TODO don't do this in real life
        const netlifyConfigFile = path.join(process.env.HOME ?? "~", "/.netlify/config.json");
        const json = fs.readFileSync(netlifyConfigFile);
        const config = JSON.parse(json.toString()) as {
            users: {
                id: {
                    auth: {
                        token: string;
                    };
                };
            };
        };

        return Object.values(config.users)[0].auth.token;
    }
}
