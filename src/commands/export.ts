import {Command} from '@oclif/command'
import * as yaml from "js-yaml";
import {Config} from "../Config";

export default class Export extends Command {
    static description = 'export the stack to a YAML CloudFormation template'

    static examples = [
        `$ lift export
AWSTemplateFormatVersion: '2010-09-09'
...
`,
    ]

    async run() {
        const stack = Config.fromFile().getStack();

        this.log(yaml.safeDump(stack.compile()));
    }
}
