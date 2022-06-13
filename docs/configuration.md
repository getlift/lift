# Lift-specific configuration

This documentation describes all available properties that can specified in the `lift` property at the root of your service file. All options defined here affect all the constructs defined in the same service file

## Automatic permissions

Each construct ships with a pre-defined list of IAM permissions that will be added to the IAM role used by all Lambda functions defined in the same service file and provisionned using the Serverless Framework capabilities. This is to ensure new-comers don't struggle with finding the correct permission sets to interact with the deployed constructs.

For exemple, the [`storage` construct](storage.md) will happen the following permissions to the IAM role provisionned by the Serverless Framework and used by all Lambda functions within the same service file:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`
- `s3:ListBucket`

You can use the `automaticPermissions` options if you want to opt out of this default behavior. This can be especially useful for production environment where you want to provision fined-grained permissions based on your actual usage of the construct - i.e. you may want to only read from the bucket provisionned uisng the `storage` construct.

Here is an exemple `serverless.yml` service file disabling automatic permission for a `storage` construct:

```yaml
service: my-app
provider:
  name: aws

lift:
    automaticPermissions: false

constructs:
    avatars:
        type: storage

plugins:
    - serverless-lift
```
