import {Command} from '@oclif/command'
import * as yaml from "js-yaml";
import {Config} from "../Config";

export default class Permissions extends Command {
    static description = 'export the IAM permissions'

    async run() {
        const stack = (new Config).getStack();

        this.log(JSON.stringify(await stack.permissions(), undefined, 2));
    }
}
