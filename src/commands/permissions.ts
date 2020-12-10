import {Command} from '@oclif/command'
import * as yaml from "js-yaml";
import {Config} from "../Config";

export default class Permissions extends Command {
    static description = 'export the IAM permissions'

    async run() {
        this.log(JSON.stringify(await Permissions.getOutput(), undefined, 2));
    }

    static async getOutput() {
        const stack = (new Config).getStack();

        return await stack.permissions();
    }
}
