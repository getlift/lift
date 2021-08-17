# Storage

The `storage` construct deploys S3 buckets to store files.

## Quick start

```bash
serverless plugin install -n serverless-lift
```

```yaml
service: my-app
provider:
  name: aws

constructs:
    avatars:
        type: storage

plugins:
    - serverless-lift
```

On `serverless deploy`, a preconfigured S3 bucket will be created.

## How it works

The `storage` construct creates and configures the S3 bucket for production:

- Files stored in the bucket are automatically encrypted (S3 takes care of encrypting and decrypting data on the fly, without change to our applications).
- File versioning is enabled to prevent any accidental data loss. Old versions are automatically purged after 30 days to avoid extra costs.
- Storage costs are optimized automatically via [intelligent tiering](https://aws.amazon.com/s3/storage-classes/).

To learn more about the architecture of this construct, [read this article](https://medium.com/serverless-transformation/file-storage-on-aws-designing-lift-1caf8c7b9bb0).

## Variables

All storage constructs expose the following variables:

- `bucketName`: the name of the deployed S3 bucket
- `bucketArn`: the ARN of the deployed S3 bucket

This can be used to reference the bucket from Lambda functions, for example:

```yaml
constructs:
    avatars:
        type: storage

functions:
    myFunction:
        handler: src/index.handler
        environment:
            BUCKET_NAME: ${construct:avatars.bucketName}
```

_How it works: the `${construct:avatars.bucketName}` variable will automatically be replaced with a CloudFormation reference to the S3 bucket._

## Permissions

By default, all the Lambda functions deployed in the same `serverless.yml` file **will be allowed to read/write into the bucket**.

In the example below, there are no IAM permissions to set up: `myFunction` will be allowed to read and write into the `avatars` bucket.

```yaml
constructs:
    avatars:
        type: storage

functions:
    myFunction:
        handler: src/index.handler
        environment:
            BUCKET_NAME: ${construct:avatars.bucketName}
```

Automatic permissions can be disabled: [read more about IAM permissions](permissions.md).

## Configuration reference

### Encryption

By default, files are encrypted using [the default S3 encryption mechanism](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html) (free).

Alternatively, for example to comply with certain policies, it is possible to [use KMS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html):

```yaml
constructs:
    avatars:
        # ...
        encryption: kms
```

### More options

Looking for more options in the construct configuration? [Open a GitHub issue](https://github.com/getlift/lift/issues/new).
