import type { CfnBucket } from "aws-cdk-lib/aws-s3";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import type { Construct as CdkConstruct } from "constructs";
import { CfnOutput, Fn, Stack } from "aws-cdk-lib";
import type { CfnResource } from "aws-cdk-lib";
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
        lifecycleRules: {
            type: "array",
            items: { type: "object" },
        },
    },
    additionalProperties: false,
} as const;
const STORAGE_DEFAULTS: Required<FromSchema<typeof STORAGE_DEFINITION>> = {
    type: "storage",
    archive: 45,
    encryption: "s3",
    lifecycleRules: [],
};

function capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function capitalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        const capitalizedKey = capitalizeFirstLetter(key);
        if (Array.isArray(value)) {
            result[capitalizedKey] = value.map((item: unknown) =>
                typeof item === "object" && item !== null ? capitalizeKeys(item as Record<string, unknown>) : item
            );
        } else if (typeof value === "object" && value !== null) {
            result[capitalizedKey] = capitalizeKeys(value as Record<string, unknown>);
        } else {
            result[capitalizedKey] = value;
        }
    }

    return result;
}

type Configuration = FromSchema<typeof STORAGE_DEFINITION>;

export class Storage extends AwsConstruct {
    public static type = "storage";
    public static schema = STORAGE_DEFINITION;

    private readonly bucket: Bucket;
    // a remplacer par StorageExtensionsKeys
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
        });

        // Default lifecycle rules (always applied)
        const defaultRules = [
            {
                Status: "Enabled",
                Transitions: [
                    {
                        StorageClass: "INTELLIGENT_TIERING",
                        TransitionInDays: 0,
                    },
                ],
            },
            {
                Status: "Enabled",
                NoncurrentVersionExpiration: {
                    NoncurrentDays: 30,
                },
            },
        ];

        // Transform user rules: capitalize keys and add Status: Enabled by default
        const userRules = resolvedConfiguration.lifecycleRules.map((rule) => {
            const capitalizedRule = capitalizeKeys(rule as Record<string, unknown>);
            if (!("Status" in capitalizedRule)) {
                capitalizedRule.Status = "Enabled";
            }

            return capitalizedRule;
        });

        const cfnBucket = this.bucket.node.defaultChild as CfnBucket;
        cfnBucket.addPropertyOverride("LifecycleConfiguration", {
            Rules: [...defaultRules, ...userRules],
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

    extend(): Record<string, CfnResource> {
        return {
            bucket: this.bucket.node.defaultChild as CfnBucket,
        };
    }

    async getBucketName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.bucketNameOutput);
    }
}
