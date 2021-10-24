import * as yaml from "js-yaml";
import fs from "fs";

export interface ServerlessConfig {
    service: string;
    providers: {
        [key: string]: {
            type?: string;
            [key: string]: unknown;
        };
    };
    constructs: {
        [key: string]: {
            provider?: string;
            type?: string;
            [key: string]: unknown;
        };
    };
    [key: string]: unknown;
}

export function readConfig(file = "serverless.yml"): ServerlessConfig {
    if (!fs.existsSync(file)) {
        throw new Error("No `serverless.yml` file found in the current directory.");
    }
    const yamlString = fs.readFileSync(file, "utf8");
    const config = yaml.safeLoad(yamlString) as Record<string, unknown>;
    if (!config || typeof config !== "object") {
        throw new Error("Invalid serverless.yml");
    }
    if (typeof config.service !== "string") {
        throw new Error("Invalid serverless.yml: the key 'service' is required and must be a string");
    }

    const validConfig = {
        service: config.service,
        providers: config.providers ?? {},
        constructs: config.constructs ?? {},
        ...config,
    };

    return validConfig as ServerlessConfig;
}
