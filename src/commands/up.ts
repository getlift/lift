import {Command} from '@oclif/command'
import {Deployer} from "../Deployer";
import {Config} from "../Config";
import chalk from "chalk";
import {Stack} from "../Stack";
import {displayCloudFormationEvents} from "../utils/cloudformation";

export default class Up extends Command {
    static description = 'deploy the stack'

    async run() {
        const stack = (new Config).getStack();

        const deployer = new Deployer;

        try {
            await deployer.deploy(stack);
        } catch (e) {
            await this.onError(deployer, stack, e);
        }
    }

    async onError(deployer: Deployer, stack: Stack, e: Error) {
        this.log(chalk`{red Deployment failed:} ${e.message}`);

        this.log('Errors found in the deployment events:');
        let events = await deployer.getLastDeployEvents(stack);
        events = events.filter(event => {
            const status = event.ResourceStatus ? event.ResourceStatus : '';
            return status.includes('FAILED') || status === 'ROLLBACK_COMPLETE';
        });
        await displayCloudFormationEvents(events);
    }
}

