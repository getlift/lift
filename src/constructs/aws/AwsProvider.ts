import { App, CfnOutput, Stack } from '@aws-cdk/core';
import { CredentialProviderChain, Credentials } from 'aws-sdk';
import { Bootstrapper, SdkProvider } from 'aws-cdk';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import path from 'path';
import fs from 'fs';
import { AwsIamPolicyStatements } from '@serverless/typescript';
import { ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { DescribeStacksInput, DescribeStacksOutput } from 'aws-sdk/clients/cloudformation';
import { log } from '../../utils/logger';
import { Provider as LegacyAwsProvider, Serverless } from '../../types/serverless';
import AwsConstruct from './AwsConstruct';
import Provider from '../Provider';

export default class AwsProvider extends Provider<AwsConstruct> {
    public readonly region: string;
    public readonly app: App;
    public readonly stack: Stack;
    private readonly legacyProvider: LegacyAwsProvider;
    /**
     * IAM role used by all Lambda functions of the stack.
     */
    public readonly lambdaRole: Role;

    constructor(serverless: Serverless, id: string) {
        super(serverless, id);

        this.legacyProvider = serverless.getProvider('aws');
        this.region = serverless.getProvider('aws').getRegion();
        this.app = new App();
        const stackName = this.legacyProvider.naming.getStackName();
        this.stack = new Stack(this.app, `${stackName}-constructs`, {
            env: {
                region: this.region,
            },
        });

        this.lambdaRole = new Role(this.stack, 'LambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
                ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
    }

    async deploy(): Promise<void> {
        // No CDK construct
        if (Object.values(this.constructs).length === 0) {
            return;
        }

        // setLogLevel(1);

        const credentials = new Credentials(this.legacyProvider.getCredentials());
        const credentialProviderChain = new CredentialProviderChain();
        credentialProviderChain.providers.push(credentials);
        const sdkProvider = new SdkProvider(credentialProviderChain, this.stack.region, {
            credentials,
        });

        // Setup the bootstrap stack
        // Ideally we don't do that every time
        log('Setting up the CDK');
        const cdkBootstrapper = new Bootstrapper({
            source: 'default',
        });
        const bootstrapDeployResult = await cdkBootstrapper.bootstrapEnvironment(
            {
                account: await this.legacyProvider.getAccountId(),
                name: 'dev',
                region: this.stack.region,
            },
            sdkProvider
        );
        if (bootstrapDeployResult.noOp) {
            log('The CDK is already set up, moving on');
        }

        log(`Deploying ${this.stack.stackName}`);
        const stackArtifact = this.app.synth().getStackByName(this.stack.stackName);
        const cloudFormation = new CloudFormationDeployments({ sdkProvider });
        const deployResult = await cloudFormation.deployStack({
            stack: stackArtifact,
        });
        if (deployResult.noOp) {
            log('Nothing to deploy, the stack is up to date 👌');
        } else {
            log('Deployment success 🎉');
        }

        await this.postDeploy();
    }

    async remove(): Promise<void> {
        await this.preRemove();
        // TODO CDK remove
    }

    async package(): Promise<void> {
        // No CDK construct
        if (Object.values(this.constructs).length === 0) {
            return;
        }
        log(`Packaging ${this.stack.stackName}`);
        const stackArtifact = this.app.synth().getStackByName(this.stack.stackName);
        const templatePath = path.join(process.cwd(), '.serverless/cdk-template.json');
        fs.writeFileSync(templatePath, JSON.stringify(stackArtifact.template, undefined, 2));
    }

    private async postDeploy(): Promise<void> {
        for (const [, construct] of Object.entries(this.constructs)) {
            if (construct.postDeploy !== undefined) {
                await construct.postDeploy();
            }
        }
    }

    private async preRemove(): Promise<void> {
        for (const [, construct] of Object.entries(this.constructs)) {
            if (construct.preRemove !== undefined) {
                await construct.preRemove();
            }
        }
    }

    /**
     * Resolves the value of a CloudFormation stack output.
     */
    async getStackOutput(output: CfnOutput): Promise<string | undefined> {
        const outputId = Stack.of(this.stack).resolve(output.logicalId) as string;
        const stackName = this.stack.stackName;

        let data: DescribeStacksOutput;
        try {
            data = await this.request<DescribeStacksInput, DescribeStacksOutput>('CloudFormation', 'describeStacks', {
                StackName: stackName,
            });
        } catch (e) {
            if (e instanceof Error && e.message === `Stack with id ${stackName} does not exist`) {
                return undefined;
            }

            throw e;
        }
        if (!data.Stacks || !data.Stacks[0].Outputs) return undefined;
        for (const item of data.Stacks[0].Outputs) {
            if (item.OutputKey === outputId) {
                return item.OutputValue;
            }
        }

        return undefined;
    }

    /**
     * Send a request to the AWS API.
     */
    async request<Input, Output>(service: string, method: string, params: Input): Promise<Output> {
        return await this.legacyProvider.request<Input, Output>(service, method, params);
    }

    private appendPermissions(): void {
        const statements = Object.entries(this.constructs)
            .map(([, construct]) => {
                return ((construct.permissions ? construct.permissions() : []) as unknown) as AwsIamPolicyStatements;
            })
            .flat(1);
        if (statements.length === 0) {
            return;
        }
        // TODO push permissions in all functions
    }
}
