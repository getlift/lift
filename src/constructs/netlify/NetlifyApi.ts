import type { NetlifySite } from "netlify";
import NetlifyAPI from "netlify";
import * as fs from "fs";
import * as path from "path";

export default class NetlifyApi {
    private _sdk?: NetlifyAPI;

    async deploy(siteId: string, deployDir: string): Promise<void> {
        await this.sdk.deploy(siteId, deployDir);
    }

    async getSiteIdFromName(name: string): Promise<string> {
        const site = await this.getSiteByName(name);
        if (site === undefined) {
            throw new Error(
                `Couldn't find a site named '${name}' in the Netlify account. Automatically creating a Netlify website is not supported yet.`
            );
        }

        return site.id;
    }

    async getSiteByName(name: string): Promise<NetlifySite | undefined> {
        const existingSites = await this.sdk.listSites();

        return existingSites.find((netlifySite) => netlifySite.name === name);
    }

    private get sdk(): NetlifyAPI {
        if (this._sdk === undefined) {
            const apiToken = this.readApiToken();
            this._sdk = new NetlifyAPI(apiToken);
        }

        return this._sdk;
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
