import { PolicyStatement } from "../Stack";
import AwsProvider from "./AwsProvider";

export default interface Construct {
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

export interface ConstructDefinition<C> {
    type: string;
    create: (id: string, configuration: C, provider: AwsProvider) => Construct;
    schema: unknown;
    commands?: { [name: string]: ConstructCommandDefinition };
}

type ConstructCommandDefinition = {
    usage: string;
    handler: (opt: Record<string, string>) => void | Promise<void>;
    options?: {
        [name: string]: {
            usage: string;
            required: boolean;
            shortcut?: string;
        };
    };
};
