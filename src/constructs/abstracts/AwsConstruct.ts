import { Construct as CdkConstruct } from "constructs";
import type { AwsProvider } from "@lift/providers";
import type { ConstructInterface } from "@lift/constructs";
import { get, isEmpty, isObject } from "lodash";
import { paths } from "traverse";
import type { CfnResource } from "aws-cdk-lib";
import ServerlessError from "../../utils/error";

export abstract class AwsConstruct extends CdkConstruct implements ConstructInterface {
    private applyExtensions(extensions: Record<string, unknown>) {
        const availableExtensions = this.extend();
        if (isEmpty(extensions) || isEmpty(availableExtensions)) {
            return;
        }
        Object.entries(extensions).forEach(([extensionKey, extensionObject]) => {
            if (!Object.keys(availableExtensions).includes(extensionKey)) {
                throw new ServerlessError(
                    `There is no extension '${extensionKey}' available on this construct. Available extensions are: ${Object.keys(
                        availableExtensions
                    ).join(", ")}.`,
                    "LIFT_UNKNOWN_EXTENSION"
                );
            }
            if (isObject(extensionObject)) {
                paths(extensionObject)
                    .filter((path) => !isEmpty(path))
                    .map((path) => {
                        return path.join(".");
                    })
                    .filter((path) => !isObject(get(extensionObject, path)))
                    .map((path) => {
                        availableExtensions[extensionKey].addOverride(path, get(extensionObject, path));
                    });
            }
        });
    }

    static create<C extends AwsConstruct = AwsConstruct>(
        this: {
            new (
                scope: CdkConstruct,
                id: string,
                configuration: { extensions?: Record<string, unknown> } & Record<string, unknown>,
                provider: AwsProvider
            ): C;
        },
        provider: AwsProvider,
        id: string,
        configuration: { extensions?: Record<string, unknown> } & Record<string, unknown>
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
        const construct = new this(provider.stack, id, configuration, provider);
        construct.applyExtensions(configuration.extensions ?? {});

        return construct;
    }

    abstract outputs?(): Record<string, () => Promise<string | undefined>>;

    abstract extend(): Record<string, CfnResource>;
}
