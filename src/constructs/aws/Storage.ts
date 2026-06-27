import type { CfnBucket } from "aws-cdk-lib/aws-s3";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import type { Construct as CdkConstruct } from "constructs";
import { CfnOutput, Fn, Stack } from "aws-cdk-lib";
import type { CfnResource } from "aws-cdk-lib";
import { AnyPrincipal, Effect, PolicyStatement as IamPolicyStatement } from "aws-cdk-lib/aws-iam";
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
        allowAcl: { type: "boolean" },
        publicPath: { type: "string" },
        cors: {
            anyOf: [{ type: "array", items: { type: "object" } }, { type: "string" }],
        },
        lifecycleRules: {
            type: "array",
            items: { type: "object" },
        },
    },
    additionalProperties: false,
} as const;
const STORAGE_DEFAULTS: Omit<Required<FromSchema<typeof STORAGE_DEFINITION>>, "allowAcl" | "cors" | "publicPath"> = {
    type: "storage",
    archive: 45,
    encryption: "s3",
    lifecycleRules: [],
};

const STORAGE_IAM_ACTIONS = [
    "s3:PutObject",
    "s3:GetObject",
    "s3:DeleteObject",
    "s3:ListBucket",
    "s3:GetObjectAcl",
    "s3:PutObjectAcl",
    "s3:GetObjectTagging",
    "s3:PutObjectTagging",
    "s3:DeleteObjectTagging",
    "s3:GetObjectAttributes",
    "s3:AbortMultipartUpload",
    "s3:ListMultipartUploadParts",
    "s3:ListBucketMultipartUploads",
    "s3:RestoreObject",
];

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

/**
 * Normalize the `publicPath` option into the S3 object key pattern that is made public (i.e. the
 * part appended after the bucket ARN in the public-read bucket policy).
 * Returns undefined when `publicPath` is not set.
 *
 * - `public`            -> `public/*` (only that prefix is public)
 * - `/`, `*` or empty   -> `*`        (the whole bucket is public)
 */
function normalizePublicPath(publicPath: string | undefined): string | undefined {
    if (publicPath === undefined) {
        return undefined;
    }

    const prefix = publicPath.replace(/^\/+/, "").replace(/\/+$/, "");
    if (prefix === "" || prefix === "*") {
        return "*";
    }

    return `${prefix}/*`;
}

type Configuration = FromSchema<typeof STORAGE_DEFINITION>;

export class Storage extends AwsConstruct {
    public static type = "storage";
    public static schema = STORAGE_DEFINITION;

    private readonly bucket: Bucket;
    private readonly allowAcl: boolean;
    private readonly publicObjects: string | undefined;
    // a remplacer par StorageExtensionsKeys
    private readonly bucketNameOutput: CfnOutput;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id);

        const resolvedConfiguration = Object.assign({}, STORAGE_DEFAULTS, configuration);
        this.allowAcl = resolvedConfiguration.allowAcl === true;
        this.publicObjects = normalizePublicPath(resolvedConfiguration.publicPath);

        const encryptionOptions = {
            s3: BucketEncryption.S3_MANAGED,
            kms: BucketEncryption.KMS_MANAGED,
        };

        this.bucket = new Bucket(this, "Bucket", {
            encryption: encryptionOptions[resolvedConfiguration.encryption],
            versioned: true,
            // By default the bucket is fully private. When `publicPath` is set, we only open the
            // *policy* levers (so the public-read bucket policy below can take effect) — ACLs stay
            // the legacy path. See the public access matrix in the docs.
            blockPublicAccess:
                this.publicObjects === undefined
                    ? BlockPublicAccess.BLOCK_ALL
                    : new BlockPublicAccess({
                          // With `allowAcl`, accept public-ACL writes (e.g. Laravel's `storePublicly()`)
                          // but keep them inert via `ignorePublicAcls`; the bucket policy is the only
                          // thing that ever grants public access.
                          blockPublicAcls: !this.allowAcl,
                          ignorePublicAcls: true,
                          blockPublicPolicy: false,
                          restrictPublicBuckets: false,
                      }),
            enforceSSL: true,
        });

        if (this.publicObjects !== undefined) {
            // Grant anonymous read to the public objects (a single prefix, or the whole bucket when
            // `publicPath` is `/` or `*`). `GetObject` only (no `ListBucket`), so objects cannot be
            // listed. Appended to the same bucket policy as the `enforceSSL` deny statement.
            this.bucket.addToResourcePolicy(
                new IamPolicyStatement({
                    effect: Effect.ALLOW,
                    principals: [new AnyPrincipal()],
                    actions: ["s3:GetObject"],
                    resources: [`${this.bucket.bucketArn}/${this.publicObjects}`],
                })
            );
        }

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
            const capitalizedRule = capitalizeKeys(rule);
            if (!("Status" in capitalizedRule)) {
                capitalizedRule.Status = "Enabled";
            }

            return capitalizedRule;
        });

        const cfnBucket = this.bucket.node.defaultChild as CfnBucket;
        cfnBucket.addPropertyOverride("LifecycleConfiguration", {
            Rules: [...defaultRules, ...userRules],
        });

        if (this.allowAcl) {
            cfnBucket.addPropertyOverride("OwnershipControls", {
                Rules: [{ ObjectOwnership: "BucketOwnerPreferred" }],
            });
        }

        if (resolvedConfiguration.cors !== undefined) {
            let corsRules;
            if (typeof resolvedConfiguration.cors === "string") {
                corsRules = [
                    {
                        AllowedOrigins: [resolvedConfiguration.cors],
                        AllowedMethods: ["GET", "PUT", "DELETE"],
                        AllowedHeaders: ["*"],
                    },
                ];
            } else {
                corsRules = resolvedConfiguration.cors.map((rule) => capitalizeKeys(rule as Record<string, unknown>));
            }
            cfnBucket.addPropertyOverride("CorsConfiguration", { CorsRules: corsRules });
        }

        this.bucketNameOutput = new CfnOutput(this, "BucketName", {
            value: this.bucket.bucketName,
        });
    }

    variables(): Record<string, unknown> {
        const variables: Record<string, unknown> = {
            bucketArn: this.bucket.bucketArn,
            bucketName: this.bucket.bucketName,
        };

        if (this.publicObjects !== undefined) {
            // Base URL of the bucket (no key), e.g. https://<bucket>.s3.<region>.amazonaws.com
            variables.publicUrl = this.bucket.virtualHostedUrlForObject();
        }

        return variables;
    }

    permissions(): PolicyStatement[] {
        return [
            new PolicyStatement(STORAGE_IAM_ACTIONS, [
                this.bucket.bucketArn,
                Stack.of(this).resolve(Fn.join("/", [this.bucket.bucketArn, "*"])),
            ]),
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
