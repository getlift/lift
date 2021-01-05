import {Config} from './src/Config';
import {Stack} from './src/Stack';
import fs from "fs";

/**
 * Serverless plugin
 */
class LiftPlugin {
    private serverless: any;
    private provider: any;

    constructor(serverless: any) {
        this.serverless = serverless;
        this.provider = this.serverless.getProvider('aws');

        // Internal stack
        if (this.serverless.service.custom && this.serverless.service.custom.lift) {
            const serverlessStackName = this.provider.naming.getStackName();
            const region = this.provider.getRegion();
            const config = new Config(serverlessStackName, region, this.serverless.service.custom.lift);
            const stack = config.getStack();
            this.configureCloudFormation(stack)
                .then(async () => this.configureEnvironmentVariables(await stack.variablesInStack()))
                .then(async () => this.configurePermissions(await stack.permissionsInStack()));
                // TODO currently this uses CF stack outputs
                // we need to reference resources from the current stack
                // .then(() => this.configureVpc(stack))
        }

        // External stack
        if (fs.existsSync('lift.yml')) {
            const externalStack = Config.fromFile().getStack();
            this.configureVpc(externalStack)
                .then(async () => this.configureEnvironmentVariables(await externalStack.variables()))
                .then(async () => this.configurePermissions(await externalStack.permissions()));
        }
    }

    async configureCloudFormation(stack: Stack) {
        this.serverless.service.resources = this.serverless.service.resources || {};
        this.serverless.service.resources.Resources = this.serverless.service.resources.Resources || {};
        this.serverless.service.resources.Outputs = this.serverless.service.resources.Outputs || {};

        const template = await stack.compile();
        Object.assign(this.serverless.service.resources.Resources, template.Resources);
        Object.assign(this.serverless.service.resources.Outputs, template.Outputs);
    }

    async configureVpc(stack: Stack) {
        if (stack.vpc) {
            this.serverless.service.provider.vpc = await stack.vpc.details();
        }
    }

    async configureEnvironmentVariables(variables: Record<string, any>) {
        const existingVariables = this.serverless.service.provider.environment || {};
        // Avoid overwriting an existing variable
        this.serverless.service.provider.environment = Object.assign({}, variables, existingVariables);
    }

    async configurePermissions(permissions: any[]) {
        this.serverless.service.provider.iamRoleStatements = this.serverless.service.provider.iamRoleStatements || [];
        this.serverless.service.provider.iamRoleStatements.push(...permissions);
    }
}

module.exports = LiftPlugin;
