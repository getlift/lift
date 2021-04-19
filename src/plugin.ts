import { App, Stack } from "@aws-cdk/core";
import { Storage } from "./components/Storage";
import type {
    CloudformationTemplate,
    Provider,
    Serverless,
} from "./types/serverless";
import { StaticWebsite } from "./components/StaticWebsite";

/**
 * Serverless plugin
 */
class LiftPlugin {
    private app: App;
    private serverless: Serverless;
    private provider: Provider;
    private hooks: Record<string, () => void | Promise<void>>;

    constructor(serverless: Serverless) {
        this.app = new App();
        serverless.stack = new Stack(this.app);

        serverless.pluginManager.addPlugin(Storage);
        serverless.pluginManager.addPlugin(StaticWebsite);

        this.serverless = serverless;
        this.provider = this.serverless.getProvider("aws");

        this.hooks = {
            "after:package:compileEvents": this.appendCloudformationResources.bind(
                this
            ),
        };
    }

    appendCloudformationResources() {
        Object.assign(this.serverless.service, {
            resources: this.app
                .synth()
                .getStackByName(this.serverless.stack.stackName)
                .template as CloudformationTemplate,
        });
    }
}

module.exports = LiftPlugin;
