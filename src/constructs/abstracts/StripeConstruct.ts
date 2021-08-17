import type { StripeProvider } from "@lift/providers";
import type { ConstructInterface } from "@lift/constructs";

export abstract class StripeConstruct<T> implements ConstructInterface {
    static create<C extends StripeConstruct = StripeConstruct>(
        this: {
            new (provider: StripeProvider, id: string, configuration: Record<string, unknown>): C;
        },
        provider: StripeProvider,
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
        return new this(provider, id, configuration);
    }

    abstract outputs?(): Record<string, () => Promise<string | undefined>>;

    protected abstract add(configuration: Record<string, unknown>): void | Promise<void>;
    protected abstract update(resources: T, configuration: Record<string, unknown>): void | Promise<void>;
    protected abstract destroy(resources: T): void | Promise<void>;
}
