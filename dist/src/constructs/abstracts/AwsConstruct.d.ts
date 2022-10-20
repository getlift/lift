import { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import type { ConstructInterface } from "@lift/constructs";
import type { CfnResource } from "aws-cdk-lib";
export declare abstract class AwsConstruct extends CdkConstruct implements ConstructInterface {
    private applyExtensions;
    static create<C extends AwsConstruct = AwsConstruct>(this: {
        new (scope: CdkConstruct, id: string, configuration: {
            extensions?: Record<string, unknown>;
        } & Record<string, unknown>, provider: AwsProvider): C;
    }, provider: AwsProvider, id: string, configuration: {
        extensions?: Record<string, unknown>;
    } & Record<string, unknown>): C;
    abstract outputs?(): Record<string, () => Promise<string | undefined>>;
    abstract extend(): Record<string, CfnResource>;
}
