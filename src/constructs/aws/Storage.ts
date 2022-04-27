import { BlockPublicAccess, Bucket, BucketEncryption, StorageClass } from "aws-cdk-lib/aws-s3";
import type { Construct as CdkConstruct } from "constructs";
import { CfnOutput, Duration, Fn, Stack } from "aws-cdk-lib";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import { PolicyStatement } from "../../CloudFormation";

const STORAGE_DEFINITION = {
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
const STORAGE_DEFAULTS: Required<FromSchema<typeof STORAGE_DEFINITION>> = {
    type: "storage",
    archive: 45,
    encryption: "s3",
};

type Configuration = FromSchema<typeof STORAGE_DEFINITION>;

export class Storage extends AwsConstruct {
    public static type = "storage";
    public static schema = STORAGE_DEFINITION;

    private readonly bucket: Bucket;
    private readonly bucketNameOutput: CfnOutput;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id);

        const resolvedConfiguration = Object.assign({}, STORAGE_DEFAULTS, configuration);

        const encryptionOptions = {
            s3: BucketEncryption.S3_MANAGED,
            kms: BucketEncryption.KMS_MANAGED,
        };

        this.bucket = new Bucket(this, "Bucket", {
            encryption: encryptionOptions[resolvedConfiguration.encryption],
            versioned: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            lifecycleRules: [
                {
                    transitions: [
                        {
                            storageClass: StorageClass.INTELLIGENT_TIERING,
                            transitionAfter: Duration.days(0),
                        },
                    ],
                },
                {
                    noncurrentVersionExpiration: Duration.days(30),
                },
            ],
        });

        this.bucketNameOutput = new CfnOutput(this, "BucketName", {
            value: this.bucket.bucketName,
        });
    }

    variables(): Record<string, unknown> {
        return {
            bucketArn: this.bucket.bucketArn,
            bucketName: this.bucket.bucketName,
        };
    }

    permissions(): PolicyStatement[] {
        return [
            new PolicyStatement(
                ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
                [this.bucket.bucketArn, Stack.of(this).resolve(Fn.join("/", [this.bucket.bucketArn, "*"]))]
            ),
        ];
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            bucketName: () => this.getBucketName(),
        };
    }

    async getBucketName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.bucketNameOutput);
    }
}
