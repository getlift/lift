# IAM Permissions

Lift constructs are designed to be functional out of the box.

This is why some constructs automatically add permissions to the Lambda functions deployed in the same `serverless.yml` file.

*Note: Lift permissions only apply to Lambda functions deployed in the same stack.*

## Example

For example, the `storage` construct deploys a S3 bucket and automatically allows Lambda functions to read and write into the bucket.

In the example below, the IAM role for `myFunction` will automatically contain permissions to read/write the `avatars` bucket.

```yaml
# serverless.yml

constructs:
    avatars:
        type: storage

functions:
    myFunction:
        # ...
```

This is essentially a shortcut to setting up permissions manually like this:

```yaml
# serverless.yml
provider:
    iam:
        role:
            statements:
                -   Effect: Allow
                    Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
                    Resource:
                        - ${construct:avatars.bucketArn}
                        - Fn::Join: ['', ['${construct:avatars.bucketArn}', '/*']]

...
```

## Disabling automatic permissions

In some scenarios, you may prefer to set up IAM permissions manually.

It is possible to disable Lift's automatic IAM permissions:

```yaml
# serverless.yml

lift:
    automaticPermissions: false
```
