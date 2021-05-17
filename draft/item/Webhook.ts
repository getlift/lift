import { Serverless } from "../../src/types/serverless";
import { PolicyStatement } from "../../src/Stack";
import {AwsComponent} from './Aws';
import {AwsQueue} from './Queue';

export class Webhook extends AwsComponent {
    private api: AwsApi;
    private queue: AwsQueue;

    protected constructor(serverless: Serverless, id: string, configuration: any) {
        super(serverless, id, configuration);

        this.queue = new AwsQueue(serverless, `${id}Queue`, {
            worker: configuration.worker,
        });
        this.api = new AwsApi(serverless, `${id}Endpoint`, {
            routes: {
                'POST /webhook': this.queue.referenceQueueUrl(),
            },
        });
    }

    commands() {
        return {
        };
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            webhookUrl: this.getEndpoint.bind(this),
            webhookQueueUrl: async () => await this.queue.getQueueUrl(),
        };
    }

    async getEndpoint() {
        const apiBaseUrl = await this.api.getUrl();
        return apiBaseUrl + '/webhook';
    }

    references(): Record<string, () => Record<string, unknown>> {
        return {
        };
    }

    async info() {
        const url = await this.getEndpoint();
        return `${this.id}: ${url}`;
    }

    lambdaPermissions(): PolicyStatement[] {
        return [
        ];
    }
}
