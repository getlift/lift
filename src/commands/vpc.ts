import {Command} from '@oclif/command'
import {Config} from "../Config";
import {VpcDetails} from '../components/Vpc';

export default class Vpc extends Command {
    static description = 'Export the VPC details'

    async run() {
        this.log(JSON.stringify(await Vpc.getOutput(), undefined, 2));
    }

    static async getOutput(): Promise<VpcDetails | undefined> {
        const stack = await Config.fromFile().getStack();

        return await stack.vpcDetails();
    }
}
