import { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import type { ConstructInterface } from "@lift/constructs";

export abstract class AwsConstruct extends CdkConstruct implements ConstructInterface {
    static create<C extends AwsConstruct = AwsConstruct>(
        this: {
            new (scope: CdkConstruct, id: string, configuration: Record<string, unknown>, provider: AwsProvider): C;
        },
        provider: AwsProvider,
        id: string,
        configuration: Record<string, unknown>
    ): C {
        /**
         * We are passing a `configuration` of type `Record<string, unknown>` to a parameter
         * of stricter type. This is theoretically invalid.
         *
         * In practice however, `configuration` has been validated with the exact JSON schema
         * of the construct. And that construct has generated the type for `configuration` based
         * on that schema.
         * As such, we _know_ that `configuration` has the correct type, it is just not validated
         * by TypeScript's compiler.
         */
        return new this(provider.stack, id, configuration, provider);
    }

    abstract outputs?(): Record<string, () => Promise<string | undefined>>;
}
