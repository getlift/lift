import { Bucket } from "@aws-cdk/aws-s3";
import { CfnOutput } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";
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

    constructor(serverless: Serverless, id: string, configuration: FromSchema<typeof STORAGE_DEFINITION>) {
        super(serverless, id, STORAGE_DEFINITION, configuration);

        this.bucket = new Bucket(this.stack, "Bucket", {
            // ...
        });
        this.bucketNameOutput = new CfnOutput(this.stack, "BucketName", {
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

    variables(): Record<string, () => Promise<string | undefined>> {
        return {
            bucketName: this.getBucketName.bind(this),
        };
    }

    async getBucketName(): Promise<string | undefined> {
        return this.getOutputValue(this.bucketNameOutput);
    }
}
