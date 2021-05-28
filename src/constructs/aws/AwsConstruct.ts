import { Construct as CdkConstruct, CfnOutput, Stack } from '@aws-cdk/core';
import { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { PolicyStatement } from '../../Stack';
import { getStackOutput } from '../../CloudFormation';
import AwsProvider from './AwsProvider';
import Construct from '../Construct';

export default abstract class AwsConstruct<S extends JSONSchema> extends CdkConstruct implements Construct {
    protected readonly provider: AwsProvider;
    protected readonly id: string;
    protected readonly configuration: FromSchema<S>;

    protected constructor(provider: AwsProvider, id: string, configuration: FromSchema<S>) {
        super(provider.stack, id);
        this.provider = provider;
        this.id = id;
        this.configuration = configuration;
    }

    abstract outputs(): Record<string, () => Promise<string | undefined>>;

    abstract commands(): Record<string, () => Promise<void>>;

    abstract references(): Record<string, () => Record<string, unknown>>;

    async postDeploy(): Promise<void> {
        // Can be overridden by constructs
    }

    async preRemove(): Promise<void> {
        // Can be overridden by constructs
    }

    permissions(): PolicyStatement[] {
        return [];
    }

    /**
     * Returns a CloudFormation intrinsic function, like Fn::Ref, GetAtt, etc.
     */
    protected getCloudFormationReference(value: string): Record<string, unknown> {
        return Stack.of(this).resolve(value) as Record<string, unknown>;
    }

    protected async getOutputValue(output: CfnOutput): Promise<string | undefined> {
        return await getStackOutput(this.provider, Stack.of(this).resolve(output.logicalId));
    }
}
