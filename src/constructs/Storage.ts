import { Bucket } from "@aws-cdk/aws-s3";
import { CfnOutput } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { AwsProvider } from "./Provider";
import { AwsComponent } from "./AwsComponent";

export const STORAGE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "storage" },
        archive: { type: "number", minimum: 30 },
        encryption: {
            anyOf: [{ const: "s3" }, { const: "kms" }],
        },
    },
    additionalProperties: false,
} as const;

export class Storage extends AwsComponent<typeof STORAGE_DEFINITION> {
    private readonly bucket: Bucket;
    private readonly bucketNameOutput: CfnOutput;

    constructor(provider: AwsProvider, id: string, configuration: FromSchema<typeof STORAGE_DEFINITION>) {
        super(provider, id, configuration);

        this.bucket = new Bucket(this.cdkNode, "Bucket", {
            // ...
        });
        this.bucketNameOutput = new CfnOutput(this.cdkNode, "BucketName", {
            value: this.bucket.bucketName,
        });
    }

    /**
     * serverless info
     *     storage: bucket-name
     */
    async infoOutput(): Promise<string | undefined> {
        return await this.getBucketName();
    }

    public variables(): Record<string, () => Promise<string | undefined>> {
        return {
            bucketName: () => this.getBucketName(),
        };
    }

    references(): Record<string, () => Record<string, unknown>> {
        return {
            bucketArn: () => this.referenceBucketArn(),
        };
    }

    referenceBucketArn(): Record<string, unknown> {
        return this.getCloudFormationReference(this.bucket.bucketArn);
    }

    async getBucketName(): Promise<string | undefined> {
        return this.getOutputValue(this.bucketNameOutput);
    }
}
