import { CredentialProviderChain, Credentials } from "aws-sdk";
import { Bootstrapper, SdkProvider } from "aws-cdk";
import { CloudFormationDeployments } from "aws-cdk/lib/api/cloudformation-deployments";
import type { AwsProvider } from "@lift/providers";
import type { Serverless } from "../types/serverless";
import type { Hook } from "../types/serverless";

export class CdkDeploy {
    private readonly provider: AwsProvider;
    public readonly hooks: Record<string, Hook>;

    constructor(private readonly serverless: Serverless) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.provider = serverless.getProvider("aws-cdk") as unknown as AwsProvider;

        this.hooks = {
            "deploy:deploy": this.deploy.bind(this),
        };
    }

    async deploy(): Promise<void> {
        const stack = this.provider.stack;

        const credentials = new Credentials(this.provider.getCredentials());
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
                account: await this.provider.getAccountId(),
                name: "dev",
                region: this.provider.region,
            },
            sdkProvider,
            {
                /**
                 * We use a CDK toolkit stack dedicated to Serverless.
                 * The reason for this is:
                 * - to keep complete control over that stack
                 * - because there are multiple versions, we don't want to force
                 * one specific version on users
                 * (see https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html#bootstrapping-templates)
                 */
                toolkitStackName: "serverless-cdk-toolkit",
                /**
                 * In the same spirit as the custom stack name, we must provide
                 * a different "qualifier": this ID will be used in CloudFormation
                 * exports to provide a unique export name.
                 */
                parameters: {
                    qualifier: "serverless",
                },
            }
        );
        if (bootstrapDeployResult.noOp) {
            // console.log("The CDK is already set up, moving on");
        }

        console.log(`Deploying ${stack.stackName}`);
        const stackArtifact = this.provider.app.synth().getStackByName(stack.stackName);
        const cloudFormation = new CloudFormationDeployments({ sdkProvider });
        const deployResult = await cloudFormation.deployStack({
            stack: stackArtifact,
            quiet: true,
        });
        if (deployResult.noOp) {
            console.log("");
            console.log("Nothing to deploy, the stack is up to date");
        } else {
            console.log("");
            console.log("Deployment success");
        }
    }
}
