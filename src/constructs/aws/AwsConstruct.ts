import { Construct as CdkConstruct } from '@aws-cdk/core';
import { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { PolicyStatement } from '../../Stack';
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

    /**
     * CDK references
     */
    abstract references(): Record<string, string>;

    async postDeploy(): Promise<void> {
        // Can be overridden by constructs
    }

    async preRemove(): Promise<void> {
        // Can be overridden by constructs
    }

    permissions(): PolicyStatement[] {
        return [];
    }
}
