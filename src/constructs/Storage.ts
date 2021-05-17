import { Bucket } from "@aws-cdk/aws-s3";
import { CfnOutput } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";
import { Component } from "./Component";

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

export class Storage extends Component<typeof STORAGE_DEFINITION> {
    private readonly bucket: Bucket;
    private readonly bucketNameOutput: CfnOutput;

    constructor(serverless: Serverless, id: string, configuration: FromSchema<typeof STORAGE_DEFINITION>) {
        super(serverless, id, STORAGE_DEFINITION, configuration);

        this.bucket = new Bucket(this, "Bucket", {
            // ...
        });
        this.bucketNameOutput = new CfnOutput(this, "BucketName", {
            value: this.bucket.bucketName,
        });
    }

    async infoOutput(): Promise<string | undefined> {
        return await this.getBucketName();
    }

    exposedVariables(): Record<string, () => Record<string, unknown>> {
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
