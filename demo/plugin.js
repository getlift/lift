const child_process = require("child_process");

class ServerlessPlugin {
    constructor(serverless, options) {
        this.serverless = serverless;

        this.setEnvironmentVariables();
        this.setPermissions();
    }

    setEnvironmentVariables() {
        this.serverless.service.provider.environment =
            this.serverless.service.provider.environment || {};

        const json = child_process.execSync("bin/run variables");
        const variables = JSON.parse(json.toString());

        Object.keys(variables).map((name) => {
            if (name in this.serverless.service.provider.environment) {
                // Avoid overwriting an existing variable
                return;
            }
            this.serverless.service.provider.environment[name] =
                variables[name];
        });
    }

    setPermissions() {
        this.serverless.service.provider.iamRoleStatements =
            this.serverless.service.provider.iamRoleStatements || [];

        const json = child_process.execSync("bin/run permissions");
        const permissions = JSON.parse(json.toString());

        this.serverless.service.provider.iamRoleStatements.push(...permissions);
    }
}

module.exports = ServerlessPlugin;
