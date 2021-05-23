import { App, Stack } from "@aws-cdk/core";
import { CredentialProviderChain, Credentials } from "aws-sdk";
import { Bootstrapper, SdkProvider } from "aws-cdk";
import { setLogLevel } from "aws-cdk/lib/logging";
import { CloudFormationDeployments } from "aws-cdk/lib/api/cloudformation-deployments";
import { AwsIamPolicyStatements } from "@serverless/typescript";
import type { Provider as LegacyAwsProvider, Serverless } from "../types/serverless";
import { Component } from "./Component";
import { AwsComponent } from "./AwsComponent";

export abstract class Provider<COMPONENT extends Component<any>> {
    protected readonly id: string;
    protected readonly stackName: string;
    protected components: Record<string, COMPONENT> = {};

    protected constructor(serverless: Serverless, id: string) {
        this.id = id;
        this.stackName = serverless.getProvider("aws").naming.getStackName();
    }

    addComponent(id: string, component: COMPONENT): void {
        this.components[id] = component;
    }

    abstract deploy(): Promise<void>;

    abstract remove(): Promise<void>;
}

export class AwsProvider extends Provider<AwsComponent<any>> {
    public readonly region: string;
    public readonly app: App;
    public readonly stack: Stack;
    private readonly legacyProvider: LegacyAwsProvider;

    constructor(serverless: Serverless, id: string) {
        super(serverless, id);

        this.legacyProvider = serverless.getProvider("aws");
        this.region = serverless.getProvider("aws").getRegion();
        this.app = new App();
        const stackName = this.legacyProvider.naming.getStackName();
        this.stack = new Stack(this.app, stackName);
    }

    async deploy(): Promise<void> {
        setLogLevel(1);

        const credentials = new Credentials(this.legacyProvider.getCredentials());
        const credentialProviderChain = new CredentialProviderChain();
        credentialProviderChain.providers.push(credentials);
        const sdkProvider = new SdkProvider(credentialProviderChain, this.stack.region, {
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
                account: await this.legacyProvider.getAccountId(),
                name: "dev",
                region: this.stack.region,
            },
            sdkProvider
        );
        if (bootstrapDeployResult.noOp) {
            console.log("The CDK is already set up, moving on");
        }

        console.log(`Deploying ${this.stack.stackName}`);
        const stackArtifact = this.app.synth().getStackByName(this.stack.stackName);
        const cloudFormation = new CloudFormationDeployments({ sdkProvider });
        const deployResult = await cloudFormation.deployStack({
            stack: stackArtifact,
        });
        if (deployResult.noOp) {
            console.log("Nothing to deploy, the stack is up to date 👌");
        } else {
            console.log("Deployment success 🎉");
        }

        await this.postDeploy();
    }

    async remove(): Promise<void> {
        await this.preRemove();
        // TODO CDK remove
    }

    private async postDeploy(): Promise<void> {
        for (const [, component] of Object.entries(this.components)) {
            await component.postDeploy();
        }
    }

    private async preRemove(): Promise<void> {
        for (const [, component] of Object.entries(this.components)) {
            await component.preRemove();
        }
    }

    /**
     * Send a request to the AWS API.
     */
    async request<Input, Output>(service: string, method: string, params: Input): Promise<Output> {
        return await this.legacyProvider.request<Input, Output>(service, method, params);
    }

    private appendPermissions(): void {
        const statements = Object.entries(this.components)
            .map(([, component]) => (component.permissions() as unknown) as AwsIamPolicyStatements)
            .flat(1);
        if (statements.length === 0) {
            return;
        }
        // TODO push permissions in all components of the provider
    }
}
