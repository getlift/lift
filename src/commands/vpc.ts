import {Command} from '@oclif/command'
import {Config} from "../Config";

export default class Variables extends Command {
    static description = 'Export the VPC details'

    async run() {
        this.log(JSON.stringify(await Variables.getOutput(), undefined, 2));
    }

    static async getOutput() {
        const stack = (new Config).getStack();
        if (! stack.vpc) {
            return {};
        }

        return await stack.vpc.details();
    }
}
