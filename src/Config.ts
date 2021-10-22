import * as yaml from "js-yaml";
import fs from "fs";

export class Config {
    private readonly stackName: string;
    private readonly region: string;
    private readonly config: Record<string, unknown>;

    constructor(stackName: string, region: string, config: Record<string, unknown>) {
        this.stackName = stackName;
        this.region = region;
        this.config = config;
    }

    static fromFile(file = "serverless.yml"): Config {
        if (!fs.existsSync(file)) {
            throw new Error("No `serverless.yml` file found in the current directory.");
        }
        const yamlString = fs.readFileSync(file, "utf8");
        const config = yaml.safeLoad(yamlString) as Record<string, unknown>;
        if (!config || typeof config !== "object" || !config.hasOwnProperty("name")) {
            throw "Invalid YAML";
        }

        return new Config(config.name as string, config.region as string, config);
    }
}
