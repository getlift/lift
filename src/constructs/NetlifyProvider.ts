import NetlifyAPI from "netlify";
import * as fs from "fs";
import * as path from "path";
import { NetlifyWebsite } from "./NetlifyWebsite";
import { log } from "../utils/logger";
import { Provider } from "./Provider";

export class NetlifyProvider extends Provider<NetlifyWebsite> {
    async deploy(): Promise<void> {
        if (Object.values(this.components).length === 0) {
            return;
        }

        const apiToken = this.readApiToken();
        const client = new NetlifyAPI(apiToken);

        for (const [id, component] of Object.entries(this.components)) {
            log(`Deploying website '${id}' to Netlify`);
            const deployDir = path.resolve(component.deployDir);
            await client.deploy(component.siteId, deployDir);
            log("Website deployed");
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
