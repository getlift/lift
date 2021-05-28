import { BlockPublicAccess, Bucket, BucketEncryption, StorageClass } from '@aws-cdk/aws-s3';
import { CfnOutput, Duration, Fn, Stack } from '@aws-cdk/core';
import { FromSchema } from 'json-schema-to-ts';
import AwsConstruct from './AwsConstruct';
import { PolicyStatement } from '../../Stack';
import AwsProvider from './AwsProvider';

export const STORAGE_DEFINITION = {
    type: 'object',
    properties: {
        type: { const: 'storage' },
        archive: { type: 'number', minimum: 30 },
        encryption: {
            anyOf: [{ const: 's3' }, { const: 'kms' }],
        },
    },
    additionalProperties: false,
    required: ['type'],
} as const;
const STORAGE_DEFAULTS = {
    archive: 45,
    encryption: 's3',
};

export class Storage extends AwsConstruct<typeof STORAGE_DEFINITION> {
    private readonly bucket: Bucket;
    private readonly bucketNameOutput: CfnOutput;

    constructor(provider: AwsProvider, id: string, configuration: FromSchema<typeof STORAGE_DEFINITION>) {
        const resolvedConfiguration = Object.assign({}, STORAGE_DEFAULTS, configuration);

        super(provider, id, resolvedConfiguration);

        const encryptionOptions = {
            s3: BucketEncryption.S3_MANAGED,
            kms: BucketEncryption.KMS_MANAGED,
        };

        this.bucket = new Bucket(this, 'Bucket', {
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
        // Allow all Lambda functions of the stack to read/write the bucket
        this.bucket.grantReadWrite(this.provider.lambdaRole);

        this.bucketNameOutput = new CfnOutput(this, 'BucketName', {
            value: this.bucket.bucketName,
        });
    }

    permissions(): PolicyStatement[] {
        return [
            new PolicyStatement(
                ['s3:PutObject', 's3:GetObject', 's3:DeleteObject', 's3:ListBucket'],
                [
                    this.referenceBucketArn(),
                    // @ts-expect-error join only accepts a list of strings, whereas other intrinsic functions are commonly accepted
                    Stack.of(this).resolve(Fn.join('/', [this.referenceBucketArn(), '*'])),
                ]
            ),
        ];
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            bucketName: () => this.getBucketName(),
        };
    }

    commands(): Record<string, () => Promise<void>> {
        return {};
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
