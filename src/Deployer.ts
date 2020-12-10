import CloudFormation, {StackEvent} from 'aws-sdk/clients/cloudformation';
import {Stack} from "./Stack";
import ora from "ora";
import {waitFor} from "./utils/wait";

class NeedToDeleteStack implements Error {
    message = 'The stack is in a failed state because its creation failed. You need to delete it: run `lift remove`.';
    name = 'NeedToDeleteStack';
}

export class Deployer {
    async deploy(stack: Stack) {
        const cloudFormation = new CloudFormation({
            region: stack.region,
        });

        let progress = ora('Checking if the stack already exists').start();

        const changeSetName = `${stack.name}-${Date.now()}`;

        let operation = null;
        try {
            operation = await this.deployOperation(cloudFormation, stack.name);
        } catch (e) {
            progress.fail();
            throw e;
        }

        progress.succeed();
        progress = ora('Preparing the list of changes ("change set") to deploy').start();

        try {
            await cloudFormation.createChangeSet({
                StackName: stack.name,
                ChangeSetName: changeSetName,
                ChangeSetType: operation,
                Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
                Parameters: [],
                TemplateBody: JSON.stringify(stack.compile()),
            }).promise();
        } catch (e) {
            progress.fail();
            throw e;
        }

        try {
            await cloudFormation.waitFor('changeSetCreateComplete', {
                StackName: stack.name,
                ChangeSetName: changeSetName,
                $waiter: {
                    delay: 5, // check every 5 seconds
                    maxAttempts: 200, // 16 minutes
                },
            }).promise();
        } catch (e) {
            progress.fail();
            const changeSet = await cloudFormation.describeChangeSet({
                StackName: stack.name,
                ChangeSetName: changeSetName,
            }).promise();
            if (changeSet.Status === 'FAILED') {
                const reason = changeSet.StatusReason ? changeSet.StatusReason : 'run "lift status" to learn more';
                if (reason.includes('The submitted information didn\'t contain changes.')) {
                    console.log('Nothing to deploy, the stack is up to date 👌');
                    progress = ora('Cleaning up the change set').start();
                    await cloudFormation.deleteChangeSet({
                        StackName: stack.name,
                        ChangeSetName: changeSetName,
                    }).promise();
                    progress.succeed();
                    console.log('All good, have a great day!');
                    return;
                }
                throw new Error(`Failed creating the change set containing the changes to deploy. ${reason}`);
            }

            throw e;
        }

        const changeSet = await cloudFormation.describeChangeSet({
            StackName: stack.name,
            ChangeSetName: changeSetName,
        }).promise();
        if (changeSet.Status === 'FAILED') {
            progress.fail();
            const reason = changeSet.StatusReason ? changeSet.StatusReason : '';
            throw new Error(`Failed creating the change set containing the changes to deploy. ${reason}`);
        }

        progress.succeed();
        progress = ora('Applying changes').start();

        await cloudFormation.executeChangeSet({
            StackName: stack.name,
            ChangeSetName: changeSetName,
        }).promise();

        try {
            if (operation === 'CREATE') {
                await cloudFormation.waitFor('stackCreateComplete', {
                    StackName: stack.name,
                    $waiter: {
                        delay: 5, // check every 5 seconds
                        maxAttempts: 20 * (60 / 5), // wait for up to 20 minutes
                    },
                }).promise();
            } else {
                await cloudFormation.waitFor('stackUpdateComplete', {
                    StackName: stack.name,
                    $waiter: {
                        delay: 5, // check every 5 seconds
                        maxAttempts: 20 * (60 / 5), // wait for up to 20 minutes
                    },
                }).promise();
            }
        } catch (e) {
            progress.fail();
            const response = await cloudFormation.describeStacks({
                StackName: stack.name,
            }).promise();
            const stackStatus = response.Stacks![0].StackStatus;
            const reason = response.Stacks![0].StackStatusReason ? response.Stacks![0].StackStatusReason : stackStatus;
            throw new Error(reason);
        }

        const response = await cloudFormation.describeStacks({
            StackName: stack.name,
        }).promise();
        const stackStatus = response.Stacks ? response.Stacks[0].StackStatus : undefined;
        if (stackStatus === 'CREATE_FAILED' || stackStatus === 'ROLLBACK_COMPLETE') {
            progress.fail();
            throw new Error(response.Stacks![0].StackStatusReason ? response.Stacks![0].StackStatusReason : stackStatus);
        }

        progress.succeed();
        console.log('Deployment success 🎉');
    }

    async getLastDeployEvents(stack: Stack): Promise<Array<StackEvent>> {
        const cloudFormation = new CloudFormation({
            region: stack.region,
        });

        const events: Array<StackEvent> = [];

        let response = await cloudFormation.describeStackEvents({
            StackName: stack.name,
        }).promise();
        for (const event of response.StackEvents ? response.StackEvents : []) {
            events.push(event);
            if (Deployer.isBeginningOfStackDeploy(event, stack.name)) {
                return events;
            }
        }

        while (response.NextToken) {
            response = await cloudFormation.describeStackEvents({
                StackName: stack.name,
                NextToken: response.NextToken,
            }).promise();
            for (const event of response.StackEvents ? response.StackEvents : []) {
                events.push(event);
                if (Deployer.isBeginningOfStackDeploy(event, stack.name)) {
                    return events;
                }
            }
        }

        return events;
    }

    async remove(stack: Stack) {
        const cloudFormation = new CloudFormation({
            region: stack.region,
        });

        const response = await cloudFormation.describeStacks({
            StackName: stack.name,
        }).promise();
        if (!response.Stacks || response.Stacks?.length === 0) {
            console.log('Stack doesn\'t exist, nothing to delete');
            return;
        }
        // Use the stack ID because it keeps working even after the stack is deleted
        const stackId = response.Stacks[0].StackId;

        const progress = ora('Deleting stack').start();

        await cloudFormation.deleteStack({
            StackName: stack.name,
        }).promise();

        try {
            await waitFor(async () => {
                progress.text = progress.text + '.';
                const response = await cloudFormation.describeStacks({
                    StackName: stackId,
                }).promise();
                const status = response.Stacks![0].StackStatus;
                const reason = response.Stacks![0].StackStatusReason ? response.Stacks![0].StackStatusReason : status;
                switch (status) {
                    case 'DELETE_IN_PROGRESS':
                        return false;
                    case 'DELETE_COMPLETE':
                        return true;
                    default:
                        throw new Error(`Deletion failed. ${reason}`);
                }
            });
        } catch (e) {
            progress.fail();
            throw e;
        }

        progress.succeed();
    }

    private async deployOperation(cloudFormation: CloudFormation, stackName: string): Promise<string> {
        let response;
        try {
            response = await cloudFormation.describeStacks({
                StackName: stackName,
            }).promise();
        } catch (e) {
            // Not found
            return 'CREATE'
        }
        if (response.Stacks && response.Stacks[0].StackStatus === 'ROLLBACK_COMPLETE') {
            throw new NeedToDeleteStack();
        }
        if (response.Stacks && response.Stacks[0].StackStatus === 'REVIEW_IN_PROGRESS') {
            return 'CREATE';
        }

        return 'UPDATE'
    }

    private static isBeginningOfStackDeploy(event: CloudFormation.StackEvent, stackName: string) {
        return event.LogicalResourceId === stackName
            && (event.ResourceStatus === 'CREATE_IN_PROGRESS'
                || event.ResourceStatus === 'UPDATE_IN_PROGRESS'
                || event.ResourceStatus === 'DELETE_IN_PROGRESS');
    }
}
