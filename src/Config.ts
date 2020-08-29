import * as yaml from "js-yaml";
import fs from "fs";
import {Stack} from "./Stack";
import {S3} from "./components/S3";
import {Database} from "./components/Database";
import {StaticWebsite} from "./components/StaticWebsite";

export class Config {
    private readonly template: Record<string, any>;

    constructor(yaml: string|undefined = undefined) {
        this.template = Config.readYaml(yaml);
        if (!this.template || typeof this.template !== 'object' || !this.template.hasOwnProperty('name')) {
            throw 'Invalid YAML';
        }
    }

    getStack(): Stack {
        const template = this.template;

        const stack = new Stack(template.name as string, template.region as string);

        if (template.hasOwnProperty('s3')) {
            for (const [key, value] of Object.entries(template.s3)) {
                stack.add(new S3(stack.name, key, value as Record<string, any>));
            }
        }
        if (template.hasOwnProperty('db')) {
            stack.add(new Database(stack.name, template.db as Record<string, any>));
        }
        if (template.hasOwnProperty('static-website')) {
            stack.add(new StaticWebsite(stack.name, template['static-website']));
        }

        return stack;
    }

    private static readYaml(yamlString: string|undefined): Record<string, any> {
        yamlString = yamlString ? yamlString : fs.readFileSync('lift.yml', 'utf8');
        const template = yaml.safeLoad(yamlString);
        if (!template || typeof template !== 'object' || !template.hasOwnProperty('name')) {
            throw 'Invalid YAML';
        }
        return template;
    }
}
