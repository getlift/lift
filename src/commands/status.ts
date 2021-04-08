import {Command} from '@oclif/command'
import chalk from "chalk";

/**
 * TODO delete this
 */
export default class Status extends Command {
    static description = 'Status of the stack'

    static examples = [
        `$ lift status
`,
    ]

    async run() {
        this.log(chalk`Hello world`);
    }
}
