# Storage

The `storage` component lets us easily deploy S3 buckets to store files.

## Quick start

```yaml
service: my-app
provider:
  name: aws

storage:
  avatars:

plugins:
    - serverless-lift
```

On `serverless deploy`, a properly configured S3 bucket will be created.

## How it works

The `storage` component creates and configures the S3 bucket for production:

- Files stored in the bucket are automatically encrypted (S3 takes care of encrypting and decrypting data on the fly, without change to our applications).
- File versioning is enabled to prevent any accidental data loss. Old versions are automatically purged after 30 days to avoid extra costs.
- Storage costs are optimized automatically via [intelligent tiering](https://aws.amazon.com/s3/storage-classes/).

To learn more about the architecture of this component, [read this article](https://medium.com/serverless-transformation/file-storage-on-aws-designing-lift-1caf8c7b9bb0).

## Configuration reference

### Encryption

By default, files are encrypted using [the default S3 encryption mechanism](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html) (free).

Alternatively, for example to comply with certain policies, it is possible to [use KMS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html):

```yaml
storage:
  avatars:
    encryption: kms
```
