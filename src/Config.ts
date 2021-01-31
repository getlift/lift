import * as yaml from "js-yaml";
import fs from "fs";
import {Stack} from "./Stack";
import {S3} from "./components/S3";
import {Database} from "./components/Database";
import {StaticWebsite} from "./components/StaticWebsite";
import {Queue} from './components/Queue';

export class Config {
    private readonly stackName: string;
    private readonly region: string;
    private readonly config: Record<string, any>;

    constructor(stackName: string, region: string, config: Record<string, any>) {
        this.stackName = stackName;
        this.region = region;
        this.config = config;
    }

    static fromFile(file: string = 'lift.yml'): Config {
        const yamlString = fs.readFileSync(file, 'utf8');
        const config = yaml.safeLoad(yamlString) as Record<string, any>;
        if (!config || typeof config !== 'object' || !config.hasOwnProperty('name')) {
            throw 'Invalid YAML';
        }

        return new Config(config.name as string, config.region as string, config);
    }

    getStack(): Stack {
        const config = this.config;

        const stack = new Stack(this.stackName, this.region);

        if (config.hasOwnProperty('s3') && config.s3) {
            for (const [key, value] of Object.entries(config.s3)) {
                stack.add(new S3(stack, key, value as Record<string, any>));
            }
        }
        if (config.hasOwnProperty('queues') && config.queues) {
            for (const [key, value] of Object.entries(config.queues)) {
                stack.add(new Queue(stack, key, value as Record<string, any>));
            }
        }
        // Enabling the VPC must come before other components that can enable the VPC (e.g. `db`)
        if (config.hasOwnProperty('vpc')) {
            stack.enableVpc(config['vpc']);
        }
        if (config.hasOwnProperty('db')) {
            stack.add(new Database(stack, config.db as Record<string, any>));
        }
        if (config.hasOwnProperty('static-website')) {
            stack.add(new StaticWebsite(stack, config['static-website']));
        }

        return stack;
    }
}
