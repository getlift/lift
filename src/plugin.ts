import { App, Stack } from "@aws-cdk/core";
import { Storage } from "./components/Storage";
import { Config } from "./Config";
import { Stack as CustomStack, PolicyStatement } from "./Stack";
import { enableServerlessLogs, logServerless } from "./utils/logger";
import type { Provider, Serverless } from "./types/serverless";

/**
 * Serverless plugin
 */
class LiftPlugin {
    private app: App;
    private serverless: Serverless;
    private provider: Provider;
    private hooks: Record<string, () => Promise<void>>;

    constructor(serverless: Serverless) {
        serverless.pluginManager.addPlugin(Storage);

        this.app = new App();
        serverless.stack = new Stack(this.app);

        enableServerlessLogs();

        this.serverless = serverless;
        this.provider = this.serverless.getProvider("aws");

        this.hooks = {
            "before:package:initialize": this.setup.bind(this),
            "after:print:print": this.print.bind(this),
        };
    }

    async print() {
        await Promise.resolve();
        console.log(
            this.app.synth().getStackByName(this.serverless.stack.stackName)
                .template
        );
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

    configureCloudFormation(stack: CustomStack) {
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
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.serverless.service.provider.iamRoleStatements.push(...permissions);
    }
}

module.exports = LiftPlugin;
