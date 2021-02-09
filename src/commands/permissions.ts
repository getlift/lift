import {Command} from '@oclif/command'
import {Config} from "../Config";

export default class Permissions extends Command {
    static description = 'export the IAM permissions'

    async run() {
        this.log(JSON.stringify(await Permissions.getOutput(), undefined, 2));
    }

    static async getOutput() {
        const stack = await Config.fromFile().getStack();

        return await stack.permissions();
    }
}
