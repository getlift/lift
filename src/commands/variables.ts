import {Command} from '@oclif/command'
import {Config} from "../Config";

export default class Variables extends Command {
    static description = 'export the environment variables'

    async run() {
        const stack = (new Config).getStack();

        this.log(JSON.stringify(await stack.variables(), undefined, 2));
    }
}
