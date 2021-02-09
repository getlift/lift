## Installation

```bash
npm -g i @mnapoli/lift
```

## Usage

Create a `lift.yml` file in your project:

```yaml
name: myapp
region: us-east-1

# let's add a database for the example:
db:
```

Deploy your stack:

```bash
lift up
```

To connect to that stack in your serverless application, install the Lift plugin and include it in `serverless.yml`:

```bash
npm i @mnapoli/lift
```

```yaml
# serverless.yml
plugins:
    - '@mnapoli/lift/plugin'

custom:
    lift:
        # Use the previously deployed stack by its name
        use: myapp
```

Lift will automatically add the permissions allowing your Lambda functions to access your stack. For example read/write the database, S3 buckets, etc.

Lift will also populate Lambda environment variables to let you access your resources.

## VPC

```yaml
vpc:
```

This will create a VPC preconfigured with public and private subnets. These subnets will automatically be setup across 3 availability zones.

The Serverless Lift plugin will automatically place your Lambda functions in the private subnet.

A NAT Gateway will be setup automatically in one AZ to provide internet access to Lambda. Since this incurs a cost of $27/month, you can skip the NAT Gateway:

```yaml
vpc:
    nat: false
```

## Database

```yaml
db:
```

This will create a MySQL database named after your application (`myapp` in the example above). It will also automatically create a VPC, so setting up the `vpc` key is optional.

The database will be securely placed in the private VPC subnet. Lambda functions will be authorized to access the database.

By default, the instance will be a `db.t3.micro` MySQL instance with no replication. It is a development instance.

Here are all the options available:

```yaml
db:
    name: mydatabasename
    engine: aurora-mysql
```

*Note: deploying a RDS database can take a long time (more than 5 minutes).*

## S3 bucket

```yaml
s3:
    avatars:
    photos:
```

This will create 2 S3 buckets named `myapp-avatars` and `myapp-photos`.

Lambda functions will be automatically authorized to read and write into the buckets.

You can make S3 buckets public and enable CORS:

```yaml
s3:
    avatars:
        public: true
        cors: true
```

## Static websites

```yaml
static-website:
```

This will create everything needed to host a static website:

- a S3 bucket
- a CloudFront CDN distribution serving the S3 bucket

To set up a custom domain name:

```yaml
static-website:
    domain: mywebsite.com
    # ARN of an ACM certificate for the domain, registered in us-east-1
    certificate: arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123
```

To enable CORS on the S3 bucket serving the website:

```yaml
static-website:
    cors: true
```

*Note: deploying a CloudFront distribution can take a long time (more than 5 minutes).*

## SQS queue

```yaml
queues:
    jobs:
```

This will create a SQS queue named `myapp-jobs`.

Lambda functions will be automatically authorized push messages into the queue.

It is possible to create a Lambda function in `serverless.yml` to process messages from that queue:

```yaml
# serverless.yml
functions:
    worker:
        handler: ...
        events:
            -   sqs:
                    arn: !GetAtt JobsQueue.Arn
```

The reference above works if the Lift config was written inside `serverless.yml`. The resource name follows the format `<Queue name>Queue`.

By default, SQS retries failed messages indefinitely. Set a max retry limit with `maxRetries`, Lift will automatically create a SQS dead letter queue that will receive the failed messages:

```yaml
queues:
    jobs:
        maxRetries: 5
```

This will create 2 SQS queues: `myapp-jobs` and `myapp-jobs-dlq` (for the failed messages).

Full options ([reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-sqs-queues.html)):

```yaml
queues:
    jobs:
        maxRetries: 5
        visibilityTimeout: 30 # seconds
```
