import {Command} from '@oclif/command'
import {Deployer} from "../Deployer";
import {Config} from "../Config";
import chalk from "chalk";
import {Stack} from "../Stack";
import {displayCloudFormationEvents, isResourceEventError} from "../utils/cloudformation";
import notifier from "node-notifier";

export default class Up extends Command {
    static description = 'deploy the stack'

    async run() {
        const stack = Config.fromFile().getStack();

        const deployer = new Deployer;

        try {
            await deployer.deploy(stack);

            notifier.notify({
                title: 'Lift up',
                message: 'The deployment has succeeded.',
            });
        } catch (e) {
            await this.onError(deployer, stack, e);

            notifier.notify({
                title: 'Lift up',
                message: 'The deployment has failed!',
            });
        }
    }

    async onError(deployer: Deployer, stack: Stack, e: Error) {
        this.log(chalk`{red Deployment failed:} ${e.message}`);

        let errors = await deployer.getLastDeployEvents(stack);
        errors = errors.filter(event => {
            return isResourceEventError(event.ResourceStatus ? event.ResourceStatus : '');
        });
        if (errors.length > 0) {
            this.log('Errors found in the deployment events:');
            await displayCloudFormationEvents(errors);
        } else {
            this.log('No errors found in the deployment events 🤔 Try running `lift status`.');
        }
    }
}

