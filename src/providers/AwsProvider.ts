import type { CfnOutput } from "@aws-cdk/core";
import { App, Stack } from "@aws-cdk/core";
import type { ProviderInterface } from "@lift/providers";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import {
    DatabaseDynamoDBSingleTable,
    Queue,
    ServerSideWebsite,
    StaticWebsite,
    Storage,
    Vpc,
    Webhook,
} from "@lift/constructs/aws";
import { CredentialProviderChain, Credentials } from "aws-sdk";
import { Bootstrapper, SdkProvider } from "aws-cdk";
import { CloudFormationDeployments } from "aws-cdk/lib/api/cloudformation-deployments";
import { getStackOutput } from "../CloudFormation";
import { awsRequest } from "../classes/aws";
import ServerlessError from "../utils/error";

const AWS_DEFINITION = {
    type: "object",
    properties: {},
    additionalProperties: false,
} as const;

export class AwsProvider implements ProviderInterface {
    public static type = "aws";
    public static schema = AWS_DEFINITION;
    private static readonly constructClasses: Record<string, StaticConstructInterface> = {};

    static registerConstructs(...constructClasses: StaticConstructInterface[]): void {
        for (const constructClass of constructClasses) {
            if (constructClass.type in this.constructClasses) {
                throw new ServerlessError(
                    `The construct type '${constructClass.type}' was registered twice`,
                    "LIFT_CONSTRUCT_TYPE_CONFLICT"
                );
            }
            this.constructClasses[constructClass.type] = constructClass;
        }
    }

    static getConstructClass(type: string): StaticConstructInterface | undefined {
        return this.constructClasses[type];
    }

    static getAllConstructClasses(): StaticConstructInterface[] {
        return Object.values(this.constructClasses);
    }

    static create(): ProviderInterface {
        return new this();
    }

    private readonly app: App;
    public readonly stack: Stack;
    public readonly region: string;
    public readonly stackName: string;

    constructor() {
        this.stackName = "stack-name";
        this.app = new App();
        this.stack = new Stack(this.app);
        this.region = "us-east-1";
    }

    createConstruct(type: string, id: string, configuration: Record<string, unknown>): ConstructInterface {
        const Construct = AwsProvider.getConstructClass(type);
        if (Construct === undefined) {
            throw new ServerlessError(
                `The construct '${id}' has an unknown type '${type}'\n` +
                    "Find all construct types available here: https://github.com/getlift/lift#constructs",
                "LIFT_UNKNOWN_CONSTRUCT_TYPE"
            );
        }

        return Construct.create(this, id, configuration);
    }

    /**
     * Resolves the value of a CloudFormation stack output.
     */
    async getStackOutput(output: CfnOutput): Promise<string | undefined> {
        return getStackOutput(this, output);
    }

    async deploy(): Promise<void> {
        const credentials = new Credentials(this.provider.getCredentials());
        const credentialProviderChain = new CredentialProviderChain();
        credentialProviderChain.providers.push(credentials);
        const sdkProvider = new SdkProvider(credentialProviderChain, this.region, {
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
                region: "us-east-1",
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

        console.log(`Deploying ${this.stackName}`);
        const stackArtifact = this.app.synth().getStackByName(this.stackName);
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

    /**
     * Send a request to the AWS API.
     */
    request<Input, Output>(service: string, method: string, params: Input): Promise<Output> {
        return awsRequest<Input, Output>(params, service, method, this.legacyProvider);
    }
}

/**
 * This is representative of a possible public API to register constructs. How it would work:
 * - 3rd party developers create a custom construct
 * - they also create a plugin that calls:
 *       AwsProvider.registerConstructs(Foo, Bar);
 *  If they use TypeScript, `registerConstructs()` will validate that the construct class
 *  implements both static fields (type, schema, create(), …) and non-static fields (outputs(), references(), …).
 */
AwsProvider.registerConstructs(
    Storage,
    Queue,
    Webhook,
    StaticWebsite,
    Vpc,
    DatabaseDynamoDBSingleTable,
    ServerSideWebsite
);
