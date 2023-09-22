# Upload

The `upload` construct deploys a S3 bucket where you can upload files from the frontend.

It also creates a Lambda function that will generate a temporary URL to upload to the S3 bucket.

## Quick start

```bash
serverless plugin install -n serverless-lift
```

```yaml
service: my-app
provider:
  name: aws

functions:
    myFunction:
        handler: src/index.handler
        events:
            - httpApi: '*'

constructs:
    upload:
        type: upload

plugins:
    - serverless-lift
```

On `serverless deploy`, a S3 bucket will be created and the Lambda function will be attached to your API Gateway.

## How it works

The `upload` construct creates and configures the S3 bucket for the upload:

- Files stored in the bucket are automatically encrypted (S3 takes care of encrypting and decrypting data on the fly, without change to our applications).
- Files are stored in a `tmp` folder and files are automatically deleted after 24 hours.
- Cross-Origin Resource Sharing (CORS) is configured to be reachable from a web browser.

It also creates a Lambda function :

- It is automatically attached to your API Gateway under the path `/upload-url`
- It requires to be called via a **POST** request containing a JSON body with the fields `fileName` and `contentType`
- It will generate the pre-signed URL that will be valid for 5 minutes
- It will return a JSON containing the `uploadUrl` and the `fileName` which is the path in the S3 bucket where the file will be stored

**Warning:** because files are deleted from the bucket after 24 hours, your backend code
should move it if it needs to be stored permanently. This is done this way to avoid uploaded files that are never used,
such as a user that uploads a file but never submits the form.

## How to use it in the browser

Here is an example of how to use this construct with `fetch`

```html
<input id="fileInput" type="file">
...
<script>
    const fileInput = document.getElementById('fileInput');

    fileInput.addEventListener('change', async function (event) {
        let file = fileInput.files[0];
        
        // CHANGE THIS URL
        const uploadResponse = await fetch('https://my-api-gateway.com/upload-url', {
            method: 'POST',
            body: JSON.stringify({
                fileName: file.name,
                contentType: file.type,
            })
        });
        const { uploadUrl, fileName } = await uploadResponse.json();
        
        await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': file.type,
            },
            body: file,
        });
        
        // send 'fileName' to your backend for processing
    });
</script>
```

## Variables

All upload constructs expose the following variables:

- `bucketName`: the name of the deployed S3 bucket
- `bucketArn`: the ARN of the deployed S3 bucket

This can be used to reference the bucket from Lambda functions, for example:

```yaml
constructs:
    upload:
        type: upload

functions:
    myFunction:
        handler: src/index.handler
        environment:
            UPLOAD_BUCKET_NAME: ${construct:upload.bucketName}
```

_How it works: the `${construct:upload.bucketName}` variable will automatically be replaced with a CloudFormation reference to the S3 bucket._

This is useful to process the uploaded files. Remember that the files will be automatically deleted after 24 hours.

## Permissions

By default, all the Lambda functions deployed in the same `serverless.yml` file **will be allowed to read/write into the upload bucket**.

In the example below, there are no IAM permissions to set up: `myFunction` will be allowed to read and write into the `upload` bucket.

```yaml
constructs:
    upload:
        type: upload

functions:
    myFunction:
        handler: src/index.handler
        environment:
            UPLOAD_BUCKET_NAME: ${construct:avatars.bucketName}
```

Automatic permissions can be disabled: [read more about IAM permissions](permissions.md).

## Configuration reference

### API Gateway

API Gateway provides 2 versions of APIs:

- v1: REST API
- v2: HTTP API, the fastest and cheapest

By default, the `upload` construct supports v2 HTTP APIs.

If your Lambda functions uses `http` events (v1 REST API) instead of `httpApi` events (v2 HTTP API), use the `apiGateway: "rest"` option:

```yaml
constructs:
    upload:
        type: upload
        apiGateway: 'rest' # either "rest" (v1) or "http" (v2, the default)

functions:
    v1:
        handler: foo.handler
        events:
            -   http: 'GET /' # REST API (v1)
    v2:
        handler: bar.handler
        events:
            -   httpApi: 'GET /' # HTTP API (v2)
```

### Encryption

By default, files are encrypted using [the default S3 encryption mechanism](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html) (free).

Alternatively, for example to comply with certain policies, it is possible to [use KMS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html):

```yaml
constructs:
    upload:
        # ...
        encryption: kms
```

### More options

Looking for more options in the construct configuration? [Open a GitHub issue](https://github.com/getlift/lift/issues/new).
