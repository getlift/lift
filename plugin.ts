import {Config} from './src/Config';
import {Stack} from './src/Stack';

/**
 * Serverless plugin
 */
class LiftPlugin {
    private serverless: any;
    constructor(serverless: any) {
        this.serverless = serverless;

        const externalStack = (new Config).getStack();

        this.configureVpc(externalStack)
            .then(() => this.configureEnvironmentVariables(externalStack))
            .then(() => this.configurePermissions(externalStack));
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
