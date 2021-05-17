import {Serverless} from '../../src/types/serverless';

export abstract class Component {
    serverless: Serverless;
    id: string;
    configuration: any;

    protected constructor(serverless: Serverless, id: string, configuration: any) {
        this.serverless = serverless;
        this.id = id;
        this.configuration = configuration;
    }

    abstract deploy(): void;

    abstract outputs(): Record<string, () => Promise<string | undefined>>;

    abstract info(): Promise<string | undefined>;

    commands() {
        return {};
    }
}
