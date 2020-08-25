import {Command} from '@oclif/command'
import {Deployer} from "../Deployer";
import {Config} from "../Config";

export default class Up extends Command {
    static description = 'deploy the stack'

    async run() {
        const stack = (new Config).getStack();

        await (new Deployer).deploy(stack);
    }
}

