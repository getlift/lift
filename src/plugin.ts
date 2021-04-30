import { App, Stack } from "@aws-cdk/core";
import { merge } from "lodash";
import { Storage } from "./components/Storage";
import type { CloudformationTemplate, Serverless } from "./types/serverless";
import { StaticWebsite } from "./components/StaticWebsite";
import { Queues } from "./components/Queues";

/**
 * Serverless plugin
 */
class LiftPlugin {
    private app: App;
    private serverless: Serverless;
    private hooks: Record<string, () => void | Promise<void>>;

    constructor(serverless: Serverless) {
        this.app = new App();
        serverless.stack = new Stack(this.app);

        serverless.pluginManager.addPlugin(Storage);
        serverless.pluginManager.addPlugin(StaticWebsite);
        serverless.pluginManager.addPlugin(Queues);

        this.serverless = serverless;

        this.hooks = {
            "after:package:compileEvents": this.appendCloudformationResources.bind(this),
        };
    }

    appendCloudformationResources() {
        merge(this.serverless.service, {
            resources: this.app.synth().getStackByName(this.serverless.stack.stackName)
                .template as CloudformationTemplate,
        });
    }
}

module.exports = LiftPlugin;
