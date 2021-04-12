import type { JSONSchema4 } from "json-schema";
import { Storage } from "./components/Storage";
import { Config } from "./Config";
import { PolicyStatement, Stack } from "./Stack";
import { enableServerlessLogs, logServerless } from "./utils/logger";

type Provider = {
    naming: {
        getStackName: () => string;
    };
    getRegion: () => string;
};

type Serverless = {
    pluginManager: {
        addPlugin: (plugin: unknown) => void;
    };
    configSchemaHandler: {
        defineTopLevelProperty: (
            pluginName: string,
            schema: JSONSchema4
        ) => void;
    };
    service: {
        custom?: {
            lift?: Record<string, unknown>;
        };
        provider: {
            vpc?: unknown;
            iamRoleStatements?: PolicyStatement[];
        };
        resources?: {
            Resources?: Record<string, unknown>;
            Outputs?: Record<string, unknown>;
        };
    };
    getProvider: (provider: string) => Provider;
};

/**
 * Serverless plugin
 */
class LiftPlugin {
    private serverless: Serverless;
    private provider: Provider;
    private hooks: Record<string, () => Promise<void>>;

    constructor(serverless: Serverless) {
        serverless.pluginManager.addPlugin(Storage);

        enableServerlessLogs();

        this.serverless = serverless;
        this.provider = this.serverless.getProvider("aws");

        this.hooks = {
            "before:package:initialize": this.setup.bind(this),
        };
    }

    async setup() {
        if (
            !this.serverless.service.custom ||
            !this.serverless.service.custom.lift
        ) {
            return;
        }
        logServerless("Lift configuration found, applying config.");
        const serverlessStackName = this.provider.naming.getStackName();
        const region = this.provider.getRegion();
        const config = new Config(
            serverlessStackName,
            region,
            this.serverless.service.custom.lift
        );
        const stack = config.getStack();
        this.configureCloudFormation(stack);
        this.configurePermissions(await stack.permissionsInStack());
    }

    configureCloudFormation(stack: Stack) {
        this.serverless.service.resources =
            this.serverless.service.resources ?? {};
        this.serverless.service.resources.Resources =
            this.serverless.service.resources.Resources ?? {};
        this.serverless.service.resources.Outputs =
            this.serverless.service.resources.Outputs ?? {};

        const template = stack.compile();
        Object.assign(
            this.serverless.service.resources.Resources,
            template.Resources
        );
        Object.assign(
            this.serverless.service.resources.Outputs,
            template.Outputs
        );
    }

    configurePermissions(permissions: PolicyStatement[]) {
        this.serverless.service.provider.iamRoleStatements =
            this.serverless.service.provider.iamRoleStatements ?? [];
        this.serverless.service.provider.iamRoleStatements.push(...permissions);
    }
}

module.exports = LiftPlugin;
