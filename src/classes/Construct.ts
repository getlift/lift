import { PolicyStatement } from "../Stack";

export default interface Construct {
    outputs(): Record<string, () => Promise<string | undefined>>;

    commands(): Record<string, () => void | Promise<void>>;

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
