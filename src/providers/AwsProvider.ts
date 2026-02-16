import type { CfnOutput } from "aws-cdk-lib";
import { App, DefaultStackSynthesizer, Stack } from "aws-cdk-lib";
import { get, merge } from "lodash";
import type { AwsCfInstruction, AwsLambdaVpcConfig } from "@serverless/typescript";
import type { ProviderInterface } from "@lift/providers";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import {
    DatabaseDynamoDBSingleTable,
    Queue,
    ServerSideWebsite,
    SinglePageApp,
    StaticWebsite,
    Storage,
    Vpc,
    Webhook,
} from "@lift/constructs/aws";
import { getStackOutput } from "../CloudFormation";
import type { CloudformationTemplate, Provider as LegacyAwsProvider, Serverless } from "../types/serverless";
import { awsRequest } from "../classes/aws";
import ServerlessError from "../utils/error";
import type { WebLambdaFunctionInterface } from "../interfaces/WebLambdaFunctionInterface";
import { GetWebLambdaFunctions } from "../utils/GetWebLambdaFunctions";

const AWS_DEFINITION = {
    type: "object",
    properties: {},
    additionalProperties: false,
} as const;

type ValueType<T extends { [key: string | number | symbol]: unknown }> = T extends {
    [key: string | number | symbol]: infer V;
}
    ? V
    : never;

type ArrayType<T extends Array<unknown>> = T extends Array<infer V> ? V : never;

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

    static create(serverless: Serverless): ProviderInterface {
        return new this(serverless);
    }

    private readonly app: App;
    public readonly stack: Stack;
    public readonly region: string;
    public readonly stackName: string;
    private readonly legacyProvider: LegacyAwsProvider;
    public naming: {
        getStackName: () => string;
        getLambdaLogicalId: (functionName: string) => string;
        getLambdaFunctionUrlLogicalId: (functionName: string) => string;
        getRestApiLogicalId: () => string;
        getHttpApiLogicalId: () => string;
    };

    constructor(private readonly serverless: Serverless) {
        this.stackName = serverless.getProvider("aws").naming.getStackName();
        this.app = new App();
        this.stack = new Stack(this.app, undefined, {
            synthesizer: new DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
            }),
        });
        this.legacyProvider = serverless.getProvider("aws");
        this.naming = this.legacyProvider.naming;
        this.region = serverless.getProvider("aws").getRegion();
        serverless.stack = this.stack;
    }

    createConstruct(type: string, id: string): ConstructInterface {
        const Construct = AwsProvider.getConstructClass(type);
        if (Construct === undefined) {
            throw new ServerlessError(
                `The construct '${id}' has an unknown type '${type}'\n` +
                    "Find all construct types available here: https://github.com/getlift/lift#constructs",
                "LIFT_UNKNOWN_CONSTRUCT_TYPE"
            );
        }
        const configuration = get(this.serverless.configurationInput.constructs, id, {});

        return Construct.create(this, id, configuration);
    }

    addFunction(functionName: string, functionConfig: unknown): void {
        if (!this.serverless.configurationInput.functions) {
            // If serverless.yml does not contain any functions, bootstrapping a new empty functions config
            this.serverless.configurationInput.functions = {};
        }

        merge(this.serverless.service.functions, {
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

    getFunction(functionName: string) {
        if (!this.serverless.service.functions) {
            return null;
        }

        return this.serverless.service.functions[functionName];
    }

    addFunctionEvent({
        functionName,
        event,
    }: {
        functionName: string;
        event: ArrayType<Required<ValueType<Required<Serverless["service"]>["functions"]>>["events"]>;
    }) {
        const slsFunction = this.getFunction(functionName);
        if (!slsFunction) {
            throw new Error(`Serverless function ${functionName} doesn't exit, can not add an event.`);
        }
        if (!slsFunction.events) {
            slsFunction.events = [];
        }
        slsFunction.events.push(event);
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
     * Returns name of the stage.
     *
     * @internal
     */
    getStage(): string | undefined {
        return this.serverless.service.provider.stage;
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

    appendCloudformationResources(): void {
        merge(this.serverless.service, {
            resources: this.app.synth().getStackByName(this.stack.stackName).template as CloudformationTemplate,
        });
    }

    /**
     * This function can be used by other constructs to get all web Lambda functions
     * Web Lambda functions must contain at least one of the following keys:
     * - url
     * - events.http
     * - events.httpApi
     * - events.alb
     */
    getWebLambdaFunctions(): WebLambdaFunctionInterface[] {
        return GetWebLambdaFunctions(this.serverless.service.functions);
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
    SinglePageApp,
    StaticWebsite,
    Vpc,
    DatabaseDynamoDBSingleTable,
    ServerSideWebsite
);
