import CloudFormation, { StackEvent } from "aws-sdk/clients/cloudformation";
import ora from "ora";
import { App, Stack } from "@aws-cdk/core";
import { Bootstrapper, SdkProvider } from "aws-cdk";
import { CloudFormationDeployments } from "aws-cdk/lib/api/cloudformation-deployments";
import { CredentialProviderChain, Credentials } from "aws-sdk";
import { setLogLevel } from "aws-cdk/lib/logging";
import { CloudformationTemplate, Serverless } from "../types/serverless";
import { waitFor } from "../utils/wait";

class NeedToDeleteStack implements Error {
    message = "The stack is in a failed state because its creation failed. You need to delete it: run `lift remove`.";
    name = "NeedToDeleteStack";
}

export async function deployCdk(serverless: Serverless, app: App, stack: Stack): Promise<void> {
    const aws = serverless.getProvider("aws");

    setLogLevel(1);

    const credentials = new Credentials(aws.getCredentials());
    const credentialProviderChain = new CredentialProviderChain();
    credentialProviderChain.providers.push(credentials);
    const sdkProvider = new SdkProvider(credentialProviderChain, stack.region, {
        credentials,
    });

    // Setup the bootstrap stack
    // Ideally we don't do that every time
    console.log("Setting up the CDK");
    const cdkBootstrapper = new Bootstrapper({
        source: "default",
    });
    const bootstrapDeployResult = await cdkBootstrapper.bootstrapEnvironment(
        {
            account: await aws.getAccountId(),
            name: "dev",
            region: aws.getRegion(),
        },
        sdkProvider
    );
    if (bootstrapDeployResult.noOp) {
        console.log("The CDK is already set up, moving on");
    }

    console.log(`Deploying ${stack.stackName}`);
    const stackArtifact = app.synth().getStackByName(stack.stackName);
    const cloudFormation = new CloudFormationDeployments({ sdkProvider });
    const deployResult = await cloudFormation.deployStack({
        stack: stackArtifact,
    });
    if (deployResult.noOp) {
        console.log("Nothing to deploy, the stack is up to date 👌");
    } else {
        console.log("Deployment success 🎉");
    }
}

export async function deployCdk2(serverless: Serverless, app: App, stack: Stack): Promise<void> {
    const template = app.synth().getStackByName(stack.stackName).template as CloudformationTemplate;

    const aws = serverless.getProvider("aws");

    const cloudFormation = new CloudFormation({
        region: stack.region,
        ...aws.getCredentials(),
    });

    let progress = ora(`Checking if the stack ${stack.stackName} already exists`).start();

    const changeSetName = `${stack.stackName}-${Date.now()}`;

    let operation = null;
    try {
        operation = await deployOperation(cloudFormation, stack.stackName);
    } catch (e) {
        progress.fail();
        throw e;
    }

    progress.succeed();
    progress = ora('Preparing the list of changes ("change set") to deploy').start();

    try {
        await cloudFormation
            .createChangeSet({
                StackName: stack.stackName,
                ChangeSetName: changeSetName,
                ChangeSetType: operation,
                Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
                Parameters: [],
                TemplateBody: JSON.stringify(template),
            })
            .promise();
    } catch (e) {
        progress.fail();
        throw e;
    }

    try {
        await cloudFormation
            .waitFor("changeSetCreateComplete", {
                StackName: stack.stackName,
                ChangeSetName: changeSetName,
                $waiter: {
                    delay: 5, // check every 5 seconds
                    maxAttempts: 200, // 16 minutes
                },
            })
            .promise();
    } catch (e) {
        const changeSet = await cloudFormation
            .describeChangeSet({
                StackName: stack.stackName,
                ChangeSetName: changeSetName,
            })
            .promise();
        if (changeSet.Status === "FAILED") {
            const reason = changeSet.StatusReason ?? 'run "lift status" to learn more';
            if (reason.includes("The submitted information didn't contain changes.")) {
                progress.succeed();
                console.log("Nothing to deploy, the stack is up to date 👌");
                progress = ora("Cleaning up the change set").start();
                await cloudFormation
                    .deleteChangeSet({
                        StackName: stack.stackName,
                        ChangeSetName: changeSetName,
                    })
                    .promise();
                progress.succeed();
                console.log("All good, have a great day!");

                return;
            }
            progress.fail();
            throw new Error(`Failed creating the change set containing the changes to deploy. ${reason}`);
        }

        throw e;
    }

    const changeSet = await cloudFormation
        .describeChangeSet({
            StackName: stack.stackName,
            ChangeSetName: changeSetName,
        })
        .promise();
    if (changeSet.Status === "FAILED") {
        progress.fail();
        const reason = changeSet.StatusReason ?? "";
        throw new Error(`Failed creating the change set containing the changes to deploy. ${reason}`);
    }

    progress.succeed();
    progress = ora("Applying changes").start();

    await cloudFormation
        .executeChangeSet({
            StackName: stack.stackName,
            ChangeSetName: changeSetName,
        })
        .promise();

    try {
        if (operation === "CREATE") {
            await cloudFormation
                .waitFor("stackCreateComplete", {
                    StackName: stack.stackName,
                    $waiter: {
                        delay: 5, // check every 5 seconds
                        maxAttempts: 20 * (60 / 5), // wait for up to 20 minutes
                    },
                })
                .promise();
        } else {
            await cloudFormation
                .waitFor("stackUpdateComplete", {
                    StackName: stack.stackName,
                    $waiter: {
                        delay: 5, // check every 5 seconds
                        maxAttempts: 20 * (60 / 5), // wait for up to 20 minutes
                    },
                })
                .promise();
        }
    } catch (e) {
        progress.fail();
        const response = await cloudFormation
            .describeStacks({
                StackName: stack.stackName,
            })
            .promise();
        const stackStatus = response.Stacks?.[0].StackStatus;
        const reason = response.Stacks?.[0].StackStatusReason ?? stackStatus;
        throw new Error(reason);
    }

    const response = await cloudFormation
        .describeStacks({
            StackName: stack.stackName,
        })
        .promise();
    const stackStatus = response.Stacks?.[0].StackStatus;
    if (stackStatus === "CREATE_FAILED" || stackStatus === "ROLLBACK_COMPLETE") {
        progress.fail();
        throw new Error(response.Stacks?.[0].StackStatusReason ?? stackStatus);
    }

    progress.succeed();
    console.log("Deployment success 🎉");
}

async function getLastDeployEvents(stack: Stack): Promise<StackEvent[]> {
    const cloudFormation = new CloudFormation({
        region: stack.region,
    });

    const events: Array<StackEvent> = [];

    let response = await cloudFormation
        .describeStackEvents({
            StackName: stack.stackName,
        })
        .promise();
    for (const event of response.StackEvents ? response.StackEvents : []) {
        events.push(event);
        if (isBeginningOfStackDeploy(event, stack.stackName)) {
            return events;
        }
    }

    while (response.NextToken !== undefined) {
        response = await cloudFormation
            .describeStackEvents({
                StackName: stack.stackName,
                NextToken: response.NextToken,
            })
            .promise();
        for (const event of response.StackEvents ? response.StackEvents : []) {
            events.push(event);
            if (isBeginningOfStackDeploy(event, stack.stackName)) {
                return events;
            }
        }
    }

    return events;
}

export async function removeCdk(serverless: Serverless, stack: Stack): Promise<void> {
    const aws = serverless.getProvider("aws");

    const cloudFormation = new CloudFormation({
        region: stack.region,
        ...aws.getCredentials(),
    });

    const response = await cloudFormation
        .describeStacks({
            StackName: stack.stackName,
        })
        .promise();
    if (!response.Stacks || response.Stacks.length === 0) {
        console.log("Stack doesn't exist, nothing to delete");

        return;
    }
    // Use the stack ID because it keeps working even after the stack is deleted
    const stackId = response.Stacks[0].StackId;

    const progress = ora("Deleting stack").start();

    await cloudFormation
        .deleteStack({
            StackName: stack.stackName,
        })
        .promise();

    try {
        await waitFor(async () => {
            progress.text = progress.text + ".";
            const deletionResponse = await cloudFormation
                .describeStacks({
                    StackName: stackId,
                })
                .promise();
            const status = deletionResponse.Stacks?.[0].StackStatus;
            const reason = deletionResponse.Stacks?.[0].StackStatusReason ?? status;
            switch (status) {
                case "DELETE_IN_PROGRESS":
                    return false;
                case "DELETE_COMPLETE":
                    return true;
                default:
                    throw new Error(`Deletion failed. ${reason ?? ""}`);
            }
        });
    } catch (e) {
        progress.fail();
        throw e;
    }

    progress.succeed();
}

async function deployOperation(cloudFormation: CloudFormation, stackName: string): Promise<string> {
    let response;
    try {
        response = await cloudFormation
            .describeStacks({
                StackName: stackName,
            })
            .promise();
    } catch (e) {
        // Not found
        return "CREATE";
    }
    if (response.Stacks?.[0].StackStatus === "ROLLBACK_COMPLETE") {
        throw new NeedToDeleteStack();
    }
    if (response.Stacks?.[0].StackStatus === "REVIEW_IN_PROGRESS") {
        return "CREATE";
    }

    return "UPDATE";
}

function isBeginningOfStackDeploy(event: CloudFormation.StackEvent, stackName: string) {
    return (
        event.LogicalResourceId === stackName &&
        (event.ResourceStatus === "CREATE_IN_PROGRESS" ||
            event.ResourceStatus === "UPDATE_IN_PROGRESS" ||
            event.ResourceStatus === "DELETE_IN_PROGRESS")
    );
}
