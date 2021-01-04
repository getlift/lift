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
                // TODO currently this uses CF stack outputs
                // we need to reference resources from the current stack
                // .then(() => this.configureVpc(stack))
                // .then(() => this.configureEnvironmentVariables(stack))
                // .then(() => this.configurePermissions(stack));
        }

        // External stack
        if (fs.existsSync('lift.yml')) {
            const externalStack = Config.fromFile().getStack();
            this.configureVpc(externalStack)
                .then(() => this.configureEnvironmentVariables(externalStack))
                .then(() => this.configurePermissions(externalStack));
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

    async configureEnvironmentVariables(stack: Stack) {
        this.serverless.service.provider.environment = this.serverless.service.provider.environment || {};

        const variables = await stack.variables();

        Object.keys(variables).map(name => {
            if (name in this.serverless.service.provider.environment) {
                // Avoid overwriting an existing variable
                return;
            }
            this.serverless.service.provider.environment[name] = variables[name];
        });
    }

    async configurePermissions(stack: Stack) {
        this.serverless.service.provider.iamRoleStatements = this.serverless.service.provider.iamRoleStatements || [];

        const permissions = await stack.permissions();

        this.serverless.service.provider.iamRoleStatements.push(...permissions);
    }
}

module.exports = LiftPlugin;
