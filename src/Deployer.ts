import CloudFormation, {StackEvent} from 'aws-sdk/clients/cloudformation';
import {Stack} from "./Stack";

class NeedToDeleteStack implements Error {
    message = 'The stack is in a failed state because its creation failed. You need to delete it before attempting to deploy again.';
    name = 'NeedToDeleteStack';
}

export class Deployer {
    async deploy(stack: Stack) {
        const cloudFormation = new CloudFormation({
            region: stack.region,
        });

        const changeSetName = `${stack.name}-${Date.now()}`;

        let operation = await this.deployOperation(cloudFormation, stack.name);

        await cloudFormation.createChangeSet({
            StackName: stack.name,
            ChangeSetName: changeSetName,
            ChangeSetType: operation,
            Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
            Parameters: [],
            TemplateBody: JSON.stringify(stack.compile()),
        }).promise();
        console.log('Deploying')

        await cloudFormation.waitFor('changeSetCreateComplete', {
            StackName: stack.name,
            ChangeSetName: changeSetName,
            $waiter: {
                delay: 5, // check every 5 seconds
            },
        }).promise();
        console.log('changeSetCreateComplete')

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
                    },
                }).promise();
            } else {
                await cloudFormation.waitFor('stackUpdateComplete', {
                    StackName: stack.name,
                    $waiter: {
                        delay: 5, // check every 5 seconds
                    },
                }).promise();
            }
        } finally {
            const response = await cloudFormation.describeStacks({
                StackName: stack.name,
            }).promise();
            const stackStatus = response.Stacks ? response.Stacks[0].StackStatus : undefined;
            if (stackStatus === 'CREATE_FAILED' || stackStatus === 'ROLLBACK_COMPLETE') {
                throw new Error('Deployment failed: ' + response.Stacks![0].StackStatusReason ? response.Stacks![0].StackStatusReason : stackStatus);
            }
        }

        console.log('Deployment finished')
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

        await cloudFormation.deleteStack({
            StackName: stack.name,
        }).promise();
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
        return event.LogicalResourceId === stackName && event.ResourceStatus === 'CREATE_IN_PROGRESS';
    }
}
