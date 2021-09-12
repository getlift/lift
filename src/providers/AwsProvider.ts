import type { CfnOutput } from "@aws-cdk/core";
import { App, Stack } from "@aws-cdk/core";
import type { AwsCfInstruction, AwsLambdaVpcConfig } from "@serverless/typescript";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import type { CredentialsOptions } from "aws-sdk/lib/credentials";
import { ManagedPolicy, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import {
    DatabaseDynamoDBSingleTable,
    HttpApi,
    Queue,
    ServerSideWebsite,
    StaticWebsite,
    Storage,
    Vpc,
    Webhook,
} from "@lift/constructs/aws";
import { getStackOutput } from "../CloudFormation";
import type { Provider as LegacyAwsProvider, Serverless } from "../types/serverless";
import { awsRequest } from "../classes/aws";
import ServerlessError from "../utils/error";

export class AwsProvider {
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

    public readonly app: App;
    public readonly stack: Stack;
    public readonly region: string;
    public readonly stackName: string;
    private readonly legacyProvider: LegacyAwsProvider;
    public naming: {
        getStackName: () => string;
        getLambdaLogicalId: (functionName: string) => string;
        getRestApiLogicalId: () => string;
        getHttpApiLogicalId: () => string;
    };
    public readonly constructs: Record<string, ConstructInterface> = {};
    /**
     * IAM role used by all Lambda functions of the stack.
     */
    public readonly lambdaRole: Role;

    constructor(private readonly serverless: Serverless) {
        this.legacyProvider = serverless.getProvider("aws");
        this.stackName = this.legacyProvider.naming.getStackName();
        this.region = this.legacyProvider.getRegion();
        this.app = new App();
        this.stack = new Stack(this.app, this.stackName, {
            env: {
                region: this.region,
            },
        });
        this.naming = this.legacyProvider.naming;
        serverless.stack = this.stack;

        this.lambdaRole = new Role(this.stack, "LambdaRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
                ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ],
        });
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

        return Construct.create(id, configuration, this);
    }

    addFunction(functionName: string, functionConfig: unknown): void {
        if (!this.serverless.configurationInput.functions) {
            // If serverless.yml does not contain any functions, bootstrapping a new empty functions config
            this.serverless.configurationInput.functions = {};
        }

        Object.assign(this.serverless.service.functions, {
            [functionName]: functionConfig,
        });
        /**
         * We must manually call `setFunctionNames()`: this is a function that normalizes functions.
         * This function is called by the Framework, but we have to call it again because we add new
         * functions after this function has already run. So our new function (that we add here)
         * will not have been normalized.
         */
        this.serverless.service.setFunctionNames(this.serverless.processedInput.options);
    }

    /**
     * @internal
     */
    setVpcConfig(securityGroups: AwsCfInstruction[], subnets: AwsCfInstruction[]): void {
        if (this.getVpcConfig() !== null) {
            throw new ServerlessError(
                "Can't register more than one VPC.\n" +
                    'Either you have several "vpc" constructs \n' +
                    'or you already defined "provider.vpc" in serverless.yml',
                "LIFT_ONLY_ONE_VPC"
            );
        }

        this.serverless.service.provider.vpc = {
            securityGroupIds: securityGroups, // TODO : merge with existing groups ?
            subnetIds: subnets,
        };
    }

    /**
     * This function can be used by other constructs to reference
     * global subnets or security groups in their resources
     *
     * @internal
     */
    getVpcConfig(): AwsLambdaVpcConfig | null {
        return this.serverless.service.provider.vpc ?? null;
    }

    /**
     * Resolves the value of a CloudFormation stack output.
     */
    async getStackOutput(output: CfnOutput): Promise<string | undefined> {
        return getStackOutput(this, output);
    }

    /**
     * Send a request to the AWS API.
     */
    request<Input, Output>(service: string, method: string, params: Input): Promise<Output> {
        return awsRequest<Input, Output>(params, service, method, this.legacyProvider);
    }

    getCredentials(): CredentialsOptions {
        return this.legacyProvider.getCredentials();
    }

    async getAccountId(): Promise<string> {
        return this.legacyProvider.getAccountId();
    }

    static getProviderName(): string {
        return "aws-cdk";
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
    ServerSideWebsite,
    HttpApi
);
