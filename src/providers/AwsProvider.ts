import type { CfnOutput } from "@aws-cdk/core";
import { App, Stack } from "@aws-cdk/core";
import { get, merge } from "lodash";
import type { ProviderInterface } from "@lift/providers";
import type { ConstructInterface, StaticConstructInterface } from "@lift/constructs";
import { DatabaseDynamoDBSingleTable, Queue, StaticWebsite, Storage, Vpc, Webhook } from "@lift/constructs/aws";
import { DatabaseSql } from "@lift/constructs/aws/DatabaseSql";
import { getStackOutput } from "../CloudFormation";
import type { CloudformationTemplate, Provider as LegacyAwsProvider, Serverless } from "../types/serverless";
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

    static create(serverless: Serverless): ProviderInterface {
        return new this(serverless);
    }

    private readonly app: App;
    public readonly stack: Stack;
    public readonly region: string;
    public readonly stackName: string;
    private readonly legacyProvider: LegacyAwsProvider;
    public naming: { getStackName: () => string; getLambdaLogicalId: (functionName: string) => string };
    private vpc: Vpc | undefined;

    constructor(private readonly serverless: Serverless) {
        this.stackName = serverless.getProvider("aws").naming.getStackName();
        this.app = new App();
        this.stack = new Stack(this.app);
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
     * The VPC is a special construct: it isn't defined in the `constructs:` section.
     *
     * Why: because other constructs that use it (like RDS DB, etc.) need the instance (JS object) of the VPC construct,
     * not just values that can be referenced via variables (like subnet IDs). This is how the CDK works.
     *
     * Because they need instances, we enter a new problem: how do we initialize constructs in the correct order so
     * that VPC is instantiated before a "RDS" construct? With variables, we avoid this problem thanks to lazy variable
     * resolution (with the "token" system of the CDK). But we can't do that with entire constructs/JS objects.
     *
     * As such, the VPC construct is a special construct that is global to the AWS provider. It is configured at the
     * AWS provider level too. And that isn't too crazy: that means 1 VPC per application, which is what we want 99%
     * of the cases. That also allows easily sharing the VPC across all constructs that need it, without having to
     * reference it explicitly in the config (the config is simpler), which is a small win.
     */
    enableVpc(): Vpc {
        if (this.vpc !== undefined) {
            return this.vpc;
        }
        if ((this.serverless.service.provider.vpc ?? null) !== null) {
            throw new ServerlessError(
                "A VPC is manually configured in the 'aws' provider configuration. That is incompatible with Lift's automatic VPC feature.",
                "LIFT_VPC_ALREADY_CONFIGURED"
            );
        }

        this.vpc = Vpc.create(this, "vpc", {});
        this.serverless.service.provider.vpc = {
            securityGroupIds: [this.vpc.appSecurityGroup.securityGroupName],
            subnetIds: this.vpc.privateSubnets.map((subnet) => subnet.subnetId),
        };

        return this.vpc;
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
}

/**
 * This is representative of a possible public API to register constructs. How it would work:
 * - 3rd party developers create a custom construct
 * - they also create a plugin that calls:
 *       AwsProvider.registerConstructs(Foo, Bar);
 *  If they use TypeScript, `registerConstructs()` will validate that the construct class
 *  implements both static fields (type, schema, create(), …) and non-static fields (outputs(), references(), …).
 */
AwsProvider.registerConstructs(Storage, Queue, Webhook, StaticWebsite, DatabaseDynamoDBSingleTable, DatabaseSql);
