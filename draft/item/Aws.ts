import {CloudformationTemplate, Provider, Serverless} from '../../src/types/serverless';
import {App, CfnOutput, Construct, Stack} from '@aws-cdk/core';
import {merge} from 'lodash';
import {Component} from './Component';
import {PolicyStatement} from '../../src/Stack';
import {getStackOutput} from '../../src/CloudFormation';

export abstract class AwsDeploy {
    serverless: Serverless;
    configuration: any;
    app: App;

    protected constructor(serverless: Serverless, configuration: any) {
        this.serverless = serverless;
        this.configuration = configuration;

        this.app = new App();
        serverless.stack = new Stack(this.app);

        // ...
    }

    initialize() {
        const cloudFormationTemplate = this.app.synth().getStackByName(this.serverless.stack.stackName)
            .template as CloudformationTemplate;

        merge(this.serverless.service, {
            resources: cloudFormationTemplate,
        });

        // Do CloudFormation deployment
        // ...
    }
}

export abstract class AwsComponent extends Component {
    aws: Provider;
    cdkNode: Construct;
    protected constructor(serverless: Serverless, id: string, configuration: any) {
        super(serverless, id, configuration);
        this.aws = serverless.getProvider("aws");
        this.cdkNode = new Construct(serverless.stack, id);
    }

    deploy(): void {
        // Nothing to do -> deployment is done by the AWS provider (CloudFormation)
    }

    // CloudFormation references
    abstract references(): Record<string, () => Record<string, unknown>>;

    abstract lambdaPermissions(): PolicyStatement[];

    /**
     * Returns a CloudFormation intrinsic function, like Fn::Ref, GetAtt, etc.
     */
    protected getCloudFormationReference(value: string): Record<string, unknown> {
        return Stack.of(this.cdkNode).resolve(value) as Record<string, unknown>;
    }

    protected async getOutputValue(output: CfnOutput): Promise<string | undefined> {
        return await getStackOutput(this.serverless, Stack.of(this.cdkNode).resolve(output.logicalId));
    }
}
