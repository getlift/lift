import { BlockPublicAccess, Bucket, BucketEncryption, StorageClass } from "@aws-cdk/aws-s3";
import { CfnOutput, Construct, Duration } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { has, isString } from "lodash";
import chalk from "chalk";
import type { Serverless } from "../types/serverless";
import { Component, ComponentConstruct } from "../classes/Component";

const LIFT_COMPONENT_NAME_PATTERN = "^[a-zA-Z0-9-_]+$";
const STORAGE_COMPONENT = "storage";
const STORAGE_DEFINITION = {
    type: "object",
    properties: {
        archive: { type: "number", minimum: 30 },
        encryption: {
            anyOf: [{ const: "s3" }, { const: "kms" }],
        },
    },
    additionalProperties: false,
} as const;
const STORAGE_DEFINITIONS = {
    type: "object",
    minProperties: 1,
    patternProperties: {
        [LIFT_COMPONENT_NAME_PATTERN]: STORAGE_DEFINITION,
    },
    additionalProperties: false,
} as const;

const STORAGE_DEFAULTS: Required<FromSchema<typeof STORAGE_DEFINITION>> = {
    archive: 45,
    encryption: "s3",
};

export class Storage extends Component<typeof STORAGE_COMPONENT, typeof STORAGE_DEFINITIONS, StorageConstruct> {
    constructor(serverless: Serverless) {
        super({
            name: STORAGE_COMPONENT,
            serverless,
            schema: STORAGE_DEFINITIONS,
        });

        this.configurationVariablesSources = {
            [STORAGE_COMPONENT]: {
                resolve: this.resolve.bind(this),
            },
        };

        this.hooks["before:aws:info:displayStackOutputs"] = this.info.bind(this);
    }

    resolve({ address }: { address: string }): { value: Record<string, unknown> } {
        const configuration = this.getConfiguration();
        if (!has(configuration, address)) {
            throw new Error(
                `No storage named ${address} configured in service file. Available components are: ${Object.keys(
                    configuration
                ).join(", ")}`
            );
        }
        const child = this.node.tryFindChild(address) as StorageConstruct;

        return {
            value: child.referenceBucketArn(),
        };
    }

    compile(): void {
        Object.entries(this.getConfiguration()).map(([storageName, storageConfiguration]) => {
            new StorageConstruct(this, storageName, this.serverless, storageConfiguration);
        });
    }

    permissions(): PolicyStatement[] {
        return this.getComponents().map((storage) => {
            return new PolicyStatement(
                ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
                [
                    storage.referenceBucketArn(),
                    // @ts-expect-error join only accepts a list of strings, whereas other intrinsic functions are commonly accepted
                    Stack.of(this).resolve(Fn.join("/", [storage.referenceBucketArn(), "*"])),
                ]
            );
        });
    }

    async info(): Promise<void> {
        const getAllStorageBucketNames = await Promise.all(
            this.getComponents().map(async (storage) => {
                return await storage.getBucketName();
            })
        );
        const foundBucketNames = getAllStorageBucketNames.filter(isString);
        if (foundBucketNames.length <= 0) {
            return;
        }
        console.log(chalk.yellow("storage:"));
        for (const storage of foundBucketNames) {
            console.log(`  ${storage}`);
        }
    }
}

class StorageConstruct extends ComponentConstruct {
    private bucket: Bucket;
    private bucketNameOutput: CfnOutput;

    constructor(
        scope: Construct,
        id: string,
        serverless: Serverless,
        storageConfiguration: FromSchema<typeof STORAGE_DEFINITION>
    ) {
        super(scope, id, serverless);
        const resolvedStorageConfiguration = Object.assign({}, STORAGE_DEFAULTS, storageConfiguration);

        const encryptionOptions = {
            s3: BucketEncryption.S3_MANAGED,
            kms: BucketEncryption.KMS_MANAGED,
        };

        this.bucket = new Bucket(this, "Bucket", {
            encryption: encryptionOptions[resolvedStorageConfiguration.encryption],
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

    referenceBucketArn(): Record<string, unknown> {
        return this.getCloudFormationReference(this.bucket.bucketArn);
    }

    async getBucketName() {
        return this.getOutputValue(this.bucketNameOutput);
    }
}
