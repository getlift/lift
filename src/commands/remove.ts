import {Command, flags} from '@oclif/command'
import {Config} from "../Config";
import chalk from "chalk";
import {Deployer} from "../Deployer";

export default class Remove extends Command {
    static description = 'delete the deployed stack'

    static examples = [
        `$ lift delete
Stack deleted.
`,
    ]

    static flags = {
        force: flags.boolean({char: 'f', description: 'force the deletion'}),
    }

    async run() {
        const {args, flags} = this.parse(Remove)

        const stack = await Config.fromFile().getStack();

        this.log(chalk`Deleting stack {green ${stack.name}}...`);

        if (!flags.force) {
            this.log(chalk`Stack not deleted, use the {green --force} option.`);
            this.exit(1);
        }

        await (new Deployer).remove(stack);

        this.log(chalk.green(`Stack ${stack.name} removed.`))
    }
}
