import {Stack} from "./Stack";

export class Config {
    private readonly stackName: string;
    private readonly region: string;
    private readonly config: Record<string, any>;

    constructor(stackName: string, region: string, config: Record<string, any>) {
        this.stackName = stackName;
        this.region = region;
        this.config = config;
    }

    async getStack(): Promise<Stack> {
        return await Stack.create(this.stackName, this.region, this.config);
    }
}
