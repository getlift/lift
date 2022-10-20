import type { PolicyStatement } from "../CloudFormation";
/**
 * Defines which methods a Lift construct must expose.
 */
export interface ConstructInterface {
    /**
     * Values shown in the CLI output.
     */
    outputs?(): Record<string, () => Promise<string | undefined>>;
    /**
     * serverless.yml variables
     */
    variables?(): Record<string, unknown>;
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
