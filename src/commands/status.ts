import {Command, flags} from '@oclif/command'
import CloudFormation from "aws-sdk/clients/cloudformation";
import {Config} from "../Config";
import {Deployer} from "../Deployer";
import chalk from "chalk";
import {displayCloudFormationEvents} from "../utils/cloudformation";

export default class Status extends Command {
    static description = 'Status of the stack'

    static examples = [
        `$ lift status
`,
    ]

    async run() {
        const stack = (new Config).getStack();

        const cloudFormation = new CloudFormation({
            region: stack.region,
        });
        const response = await cloudFormation.describeStacks({
            StackName: stack.name,
        }).promise();
        const cfStack = response.Stacks ? response.Stacks[0] : undefined;
        if (!cfStack) {
            this.error('The stack does not exist in CloudFormation');
            this.exit(1);
        }

        this.log(chalk`{green stack:} ${stack.name}`);
        this.log(chalk`{green region:} ${stack.region}`);
        if (cfStack.StackStatus.includes('FAILED') || cfStack.StackStatus === 'ROLLBACK_COMPLETE') {
            this.log(chalk`{green status:} {red ${cfStack.StackStatus}}`);
        } else {
            this.log(chalk`{green status:} ${cfStack.StackStatus}`);
        }
        if (cfStack.StackStatus === 'ROLLBACK_COMPLETE') {
            this.log(chalk`\t{gray The stack is in a failed state because its creation failed. You need to delete it before attempting to deploy again.}`);
        }
        this.log(chalk`{green last update:} ${cfStack.LastUpdatedTime?.toLocaleString()}`);
        this.log();

        // Outputs
        this.log(chalk.underline('Stack outputs:'));
        for (const output of cfStack.Outputs!) {
            this.log(chalk`{green ${output.OutputKey}:} ${output.OutputValue} {gray - ${output.Description}}`);
        }
        this.log();

        this.log(chalk.underline('Last deployment:'));
        const deployer = new Deployer();
        const events = await deployer.getLastDeployEvents(stack);
        await displayCloudFormationEvents(events);
    }
}
