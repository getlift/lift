import {Command} from '@oclif/command'
import {Config} from "../Config";

export default class Variables extends Command {
    static description = 'Export the VPC details'

    async run() {
        const stack = (new Config).getStack();

        if (! stack.vpc) {
            this.log(JSON.stringify({}));
            return;
        }

        this.log(JSON.stringify(await stack.vpc.details(), undefined, 2));
    }
}
