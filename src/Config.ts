import * as yaml from "js-yaml";
import fs from "fs";
import {Stack} from "./Stack";
import CloudFormation from 'aws-sdk/clients/cloudformation';
import {getMetadata} from './aws/CloudFormation';

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

    static async fromStack(stackName: string, region: string): Promise<Config> {
        const metadata = await getMetadata(region, stackName);
        if (! metadata) {
            throw new Error(`The stack ${stackName} was not deployed by Lift: impossible to 'use'.`)
        }
        if (! metadata['Lift::Template'] || ! metadata['Lift::Version']) {
            throw new Error(`The stack ${stackName} was not deployed by Lift: impossible to 'use'.`)
        }
        if (metadata['Lift::Version'] !== '1') {
            throw new Error(`The stack ${stackName} was deployed by a different version of Lift (expected version 1, got ${metadata['Lift::Version']}).`)
        }
        const config = JSON.parse(metadata['Lift::Template']) as Record<string, any>;
        if (!config || typeof config !== 'object' || !config.hasOwnProperty('name')) {
            throw 'Invalid YAML';
        }

        return new Config(config.name as string, config.region as string, config);
    }

    async getStack(): Promise<Stack> {
        return await Stack.create(this.stackName, this.region, this.config);
    }
}
