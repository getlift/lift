import NetlifyAPI, { NetlifySite } from 'netlify';
import * as fs from 'fs';
import * as path from 'path';
import { NetlifyWebsite } from './NetlifyWebsite';
import Provider from '../Provider';

export default class NetlifyProvider extends Provider<NetlifyWebsite> {
    private _netlify?: NetlifyAPI;

    get netlify(): NetlifyAPI {
        if (this._netlify === undefined) {
            const apiToken = this.readApiToken();
            this._netlify = new NetlifyAPI(apiToken);
        }

        return this._netlify;
    }

    async package(): Promise<void> {
        // Nothing to do
    }

    async deploy(): Promise<void> {
        for (const construct of Object.values(this.constructs)) {
            // TODO auto-create websites
            construct.build();
            await construct.upload();
        }
    }

    async remove(): Promise<void> {
        // TODO
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
        const existingSites = await this.netlify.listSites();

        return existingSites.find((netlifySite) => netlifySite.name === name);
    }

    private readApiToken(): string {
        // TODO don't do this in real life
        const netlifyConfigFile = path.join(process.env.HOME ?? '~', '/.netlify/config.json');
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
