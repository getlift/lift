import { PolicyStatement } from "../CloudFormation";
import { AwsProvider } from "./AwsProvider";
import ServerlessError from "../utils/error";
import { CliOptions } from "../types/serverless";

/**
 * Defines which methods a Lift construct must expose.
 */
export interface ConstructInterface {
    outputs(): Record<string, () => Promise<string | undefined>>;

    /**
     * CloudFormation references
     */
    references(): Record<string, Record<string, unknown>>;

    /**
     * Post-CloudFormation deployment
     */
    postDeploy?(): Promise<void>;

    /**
     * Pre-CloudFormation deletion
     */
    preRemove?(): Promise<void>;

    /**
     * IAM permissions to add to Lambda functions of the stack
     */
    permissions?(): PolicyStatement[];
}

/**
 * Defines which static properties and methods a Lift construct must expose.
 */
export interface StaticConstructInterface {
    type: string;
    schema: {
        type: "object";
        [k: string]: unknown;
    };
    commands?: ConstructCommands;
    create(provider: AwsProvider, id: string, configuration: Record<string, unknown>): ConstructInterface;
}

export type ConstructCommands = Record<string, ConstructCommandDefinition>;
type ConstructCommandDefinition = {
    usage: string;
    handler: (options: CliOptions) => void | Promise<void>;
    options?: {
        [name: string]: {
            usage: string;
            type: string;
            required?: boolean;
            shortcut?: string;
        };
    };
};

export function assertValidConstructClass(constructClass: unknown): asserts constructClass is StaticConstructInterface {
    if (typeof constructClass !== "function") {
        throw new ServerlessError(
            `Tried to register a construct that is not an object. The construct is of type '${typeof constructClass}'`,
            "LIFT_CONSTRUCT_INVALID_OBJECT"
        );
    }
    // Type
    if (!hasProperty(constructClass, "type") || typeof constructClass.type !== "string") {
        throw new ServerlessError(
            `The construct '${constructClass.constructor.name}' does not expose a static 'type' string property. ` +
                "All constructs must expose a type name via a 'type' property.",
            "LIFT_CONSTRUCT_MISSING_TYPE"
        );
    }
    // Schema
    if (!hasProperty(constructClass, "schema") || typeof constructClass.schema !== "object") {
        throw new ServerlessError(
            `The construct '${constructClass.type}' does not expose a static 'schema' property. ` +
                "All constructs must expose a JSON schema via a 'schema' property.",
            "LIFT_CONSTRUCT_MISSING_SCHEMA"
        );
    }
}

/**
 * This crazy function only exists to make TypeScript happy with type narrowing
 */
// eslint-disable-next-line @typescript-eslint/ban-types
function hasProperty<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): obj is X & Record<Y, unknown> {
    // eslint-disable-next-line no-prototype-builtins
    return obj.hasOwnProperty(prop);
}
