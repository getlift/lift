import {Command} from '@oclif/command'
import {Config} from "../Config";
import {VpcDetails} from '../components/Vpc';

export default class Vpc extends Command {
    static description = 'Export the VPC details'

    async run() {
        this.log(JSON.stringify(await Vpc.getOutput(), undefined, 2));
    }

    static async getOutput(): Promise<VpcDetails|null> {
        const stack = Config.fromFile().getStack();
        if (! stack.vpc) {
            return null;
        }

        return await stack.vpc.details();
    }
}
