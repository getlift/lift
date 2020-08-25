import {Command, flags} from '@oclif/command'
import * as yaml from "js-yaml";
import {Deployer} from "../Deployer";
import {Config} from "../Config";
import chalk from "chalk";

export default class Up extends Command {
    static description = 'describe the command here'

    static examples = [
        `$ lift hello
hello world from ./src/hello.ts!
`,
    ]

    static flags = {
        help: flags.help({char: 'h'}),
        // flag with a value (-n, --name=VALUE)
        name: flags.string({char: 'n', description: 'name to print'}),
    }

    static args = [{name: 'file'}]

    async run() {
        const {args, flags} = this.parse(Up)

        const stack = (new Config).getStack();

        this.log(chalk.gray(yaml.safeDump(stack.compile())));

        const deployer = new Deployer();
        await deployer.deploy(stack);
    }
}
