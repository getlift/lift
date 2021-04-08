import {Config} from './src/Config';
import {Stack} from './src/Stack';
import {VpcDetails} from './src/components/Vpc';
import {enableServerlessLogs, logServerless} from './src/utils/logger';

/**
 * Serverless plugin
 */
class LiftPlugin {
    private serverless: any;
    private provider: any;
    private hooks: Record<string, Function>;

    constructor(serverless: any) {
        enableServerlessLogs();

        this.serverless = serverless;
        this.provider = this.serverless.getProvider('aws');

        this.hooks = {
            'before:package:initialize': this.setup.bind(this),
        }
    }

    async setup() {
        if (!this.serverless.service.custom || !this.serverless.service.custom.lift) {
            return;
        }
        logServerless('Lift configuration found, applying config.');
        const serverlessStackName = this.provider.naming.getStackName();
        const region = this.provider.getRegion();
        const config = new Config(serverlessStackName, region, this.serverless.service.custom.lift);
        const stack = await config.getStack();
        await this.configureCloudFormation(stack);
        await this.configureVpc(await stack.vpcDetailsReference());
        await this.configurePermissions(await stack.permissionsInStack());
    }

    async configureCloudFormation(stack: Stack) {
        this.serverless.service.resources = this.serverless.service.resources || {};
        this.serverless.service.resources.Resources = this.serverless.service.resources.Resources || {};
        this.serverless.service.resources.Outputs = this.serverless.service.resources.Outputs || {};

        const template = await stack.compile();
        Object.assign(this.serverless.service.resources.Resources, template.Resources);
        Object.assign(this.serverless.service.resources.Outputs, template.Outputs);
    }

    async configureVpc(vpcDetails: VpcDetails|undefined) {
        if (vpcDetails) {
            this.serverless.service.provider.vpc = vpcDetails;
        }
    }

    async configurePermissions(permissions: any[]) {
        this.serverless.service.provider.iamRoleStatements = this.serverless.service.provider.iamRoleStatements || [];
        this.serverless.service.provider.iamRoleStatements.push(...permissions);
    }
}

module.exports = LiftPlugin;
