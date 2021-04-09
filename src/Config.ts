import { Stack } from "./Stack";

export class Config {
    private readonly stackName: string;
    private readonly region: string;
    private readonly config: Record<string, unknown>;

    constructor(
        stackName: string,
        region: string,
        config: Record<string, unknown>
    ) {
        this.stackName = stackName;
        this.region = region;
        this.config = config;
    }

    getStack(): Stack {
        return Stack.create(this.stackName, this.region, this.config);
    }
}
