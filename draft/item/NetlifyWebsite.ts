import {Serverless} from '../../src/types/serverless';
import {Component} from './Component';

class NetlifyWebsite extends Component {
    public constructor(serverless: Serverless, id: string, configuration: any) {
        super(serverless, id, configuration);
    }

    async deploy() {
        await this.setupWebsite();
        await this.uploadFiles();
    }

    commands() {
        return {
            // sls netlify:status
            // sls netlify:status -c <component-name>
            'netlify:status': this.deploy.bind(this),
        };
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            getUrl: this.getUrl.bind(this),
        };
    }

    async info(): Promise<string | undefined> {
        const url = await this.getUrl();
        return `${this.id}: ${url}`;
    }

    private async setupWebsite() {
        // todo
    }

    private async uploadFiles() {
        // todo
    }

    private async getUrl(): Promise<string | undefined> {
        return 'todo';
    }
}
