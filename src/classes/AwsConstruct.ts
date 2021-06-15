import { Construct as CdkConstruct } from "@aws-cdk/core";
import { ConstructInterface } from ".";
import { AwsProvider } from "./AwsProvider";

export abstract class AwsConstruct<T extends Record<string, unknown>>
    extends CdkConstruct
    implements ConstructInterface {
    constructor(
        protected readonly scope: CdkConstruct,
        protected readonly id: string,
        protected readonly configuration: T,
        protected readonly provider: AwsProvider
    ) {
        super(scope, id);
    }

    abstract outputs(): Record<string, () => Promise<string | undefined>>;

    abstract commands(): Record<string, () => void | Promise<void>>;

    /**
     * CloudFormation references
     */
    abstract references(): Record<string, Record<string, unknown>>;
}
