import Vpc from './src/commands/vpc';
import Variables from './src/commands/variables';
import Permissions from './src/commands/permissions';

/**
 * Serverless plugin
 */
class LiftPlugin {
    private serverless: any;
    constructor(serverless: any) {
        this.serverless = serverless;

        this.setVpc()
            .then(() => this.setEnvironmentVariables())
            .then(() => this.setPermissions());
    }

    async setVpc() {
        const details = await Vpc.getOutput();
        if (details) {
            this.serverless.service.provider.vpc = details;
        }
    }

    async setEnvironmentVariables() {
        this.serverless.service.provider.environment = this.serverless.service.provider.environment || {};

        const variables = await Variables.getOutput();

        Object.keys(variables).map(name => {
            if (name in this.serverless.service.provider.environment) {
                // Avoid overwriting an existing variable
                return;
            }
            this.serverless.service.provider.environment[name] = variables[name];
        });
    }

    async setPermissions() {
        this.serverless.service.provider.iamRoleStatements = this.serverless.service.provider.iamRoleStatements || [];

        const permissions = await Permissions.getOutput();

        this.serverless.service.provider.iamRoleStatements.push(...permissions);
    }
}

module.exports = LiftPlugin;
