import { App, Stack } from "@aws-cdk/core";
import { merge } from "lodash";
import type { CloudformationTemplate, Serverless } from "./types/serverless";
import { ComponentRegistry } from "./constructs/ComponentRegistry";

/**
 * Serverless plugin
 */
class LiftPlugin {
    private app: App;
    private serverless: Serverless;
    private hooks: Record<string, () => void | Promise<void>>;

    constructor(serverless: Serverless) {
        // This could go in an "awsProvider" plugin
        this.app = new App();
        serverless.stack = new Stack(this.app);

        serverless.pluginManager.addPlugin(ComponentRegistry);

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
