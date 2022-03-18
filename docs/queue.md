# Queue

Some tasks are too long to be processed synchronously. Instead, they can be processed in the background via a job queue and worker.

The `queue` construct deploys a properly configured **SQS queue** with a **worker running on AWS Lambda**.

## Quick start

```bash
serverless plugin install -n serverless-lift
```

```yaml
service: my-app
provider:
    name: aws

constructs:
    my-queue:
        type: queue
        worker:
            handler: src/worker.handler

plugins:
    - serverless-lift
```

## How it works

The `queue` construct deploys the following resources:

- An SQS queue: this is where messages to process should be sent.
- A `worker` Lambda function: this function processes every message sent to the queue.
- An SQS "[dead letter queue](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)": this queue stores all the messages that failed to be processed.
- Optionally, a CloudWatch alarm that sends an email when the dead letter queue contains failed messages.

<img src="img/queue.png" width="600"/>

### Production ready

Lift constructs are production-ready:

- Failed messages are retried up to 3 times ([configurable](#retries)) instead of "infinitely" by default
- Messages that still fail to be processed are stored in the SQS dead letter queue
- Failed messages in the dead letter queue are stored for 14 days (the maximum) to give developers time to deal with them
- The SQS "Visibility Timeout" setting is configured per AWS recommendations ([more details](#retry-delay))
- Batch processing is disabled by default ([configurable](#batch-size)): errors need to be handled properly using [partial batch failures](#partial-batch-failures)
- The event mapping is configured with `ReportBatchItemFailures` enabled by default for [partial batch failures](#partial-batch-failures) to work out of the box

## Example

Let's deploy a queue called `jobs` (with its `worker` function), as well as a separate function (`publisher`) that publishes messages into the queue:

```yaml
service: my-app
provider:
    name: aws

constructs:
    jobs:
        type: queue
        worker:
            handler: src/worker.handler

functions:
    publisher:
        handler: src/publisher.handler
        environment:
            QUEUE_URL: ${construct:jobs.queueUrl}

plugins:
    - serverless-lift
```

Our `publisher` function can send messages into the SQS queue using the AWS SDK:

```js
// src/publisher.js
const AWS = require('aws-sdk');
const sqs = new AWS.SQS({
    apiVersion: 'latest',
    region: process.env.AWS_REGION,
});

exports.handler = async function(event, context) {
    // Send a message into SQS
    await sqs.sendMessage({
        QueueUrl: process.env.QUEUE_URL,
        // Any message data we want to send
        MessageBody: JSON.stringify({
            fileName: 'foo/bar.mp4'
        }),
    }).promise();
}
```

When the `publisher` function is invoked, it will push a message into SQS. SQS will then automatically trigger the `worker` function, which could be written like this:

```js
// src/worker.js
exports.handler = function(event, context) {
    // SQS may invoke with multiple messages
    for (const message of event.Records) {
        const bodyData = JSON.parse(message.body);

        const fileName = bodyData.fileName;
        // do something with `fileName`
    }
}
```

## Variables

All queue constructs expose the following variables:

- `queueUrl`: the URL of the deployed SQS queue
- `queueArn`: the ARN of the deployed SQS queue

These can be used to reference the queue from other Lambda functions, for example:

```yaml
constructs:
    my-queue:
        type: queue

functions:
    otherFunction:
        handler: src/publisher.handler
        environment:
            QUEUE_URL: ${construct:my-queue.queueUrl}
```

_How it works: the `${construct:my-queue.queueUrl}` variable will automatically be replaced with a CloudFormation reference to the SQS queue._

## Permissions

By default, all the Lambda functions deployed in the same `serverless.yml` file **will be allowed to push messages into the queue**.

In the example below, there are no IAM permissions to set up: `myFunction` will be allowed to send messages into `my-queue`.

```yaml
constructs:
    my-queue:
        type: queue
        # ...

functions:
    myFunction:
        handler: src/publisher.handler
        environment:
            QUEUE_URL: ${construct:my-queue.queueUrl}
```

Automatic permissions can be disabled: [read more about IAM permissions](permissions.md).

## Commands

The following commands are available on `queue` constructs:

```
serverless <construct-name>:logs
serverless <construct-name>:send
serverless <construct-name>:failed
serverless <construct-name>:failed:purge
serverless <construct-name>:failed:retry
```

- `serverless <construct-name>:logs`

This command displays the logs of the Lambda "worker" function.

It is an alias to `serverless logs --function <construct-name>Worker` and supports the same options, for example `--tail` to tail logs live.

- `serverless <construct-name>:send`

Send a message into the SQS queue.

This command can be useful while developing to push sample messages into the queue.

When the command runs, it will prompt for the body of the SQS message. It is also possible to provide the body via the `--body="message body here"` option.

- `serverless <construct-name>:failed`

This command lists the failed messages stored in the dead letter queue.

Use this command to investigate why these messages failed to be processed.

Note: this command will only fetch the first messages available (it will not dump thousands of messages into the terminal).

- `serverless <construct-name>:failed:purge`

This command clears all messages from the dead letter queue.

Use this command if you have failed messages and you don't want to retry them.

- `serverless <construct-name>:failed:retry`

This command retries all failed messages of the dead letter queue by moving them to the main queue.

Use this command if you have failed messages and you want to retry them again.

## Configuration reference

### Worker

```yaml
constructs:
    my-queue:
        type: queue
        worker:
            # The Lambda function is configured here
            handler: src/worker.handler
```

_Note: the Lambda "worker" function is configured in the `queue` construct, instead of being defined in the `functions` section._

The only required setting is the `handler`: this should point to the code that handles SQS messages. The handler [should be written to handle SQS events](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html), for example in JavaScript:

```js
exports.handler = async function (event, context) {
    event.Records.forEach(record => {
        // `record` contains the message that was pushed to SQS
    });
}
```

[All settings allowed for functions](https://www.serverless.com/framework/docs/providers/aws/guide/functions/) can be used under the `worker` key. For example:

```yaml
constructs:
    my-queue:
        # ...
        worker:
            handler: src/worker.handler
            memorySize: 512
            timeout: 10
```

_Note: Lift will automatically configure the function to be triggered by SQS. It is not necessary to define `events` on the function._

### Alarm

```yaml
constructs:
    my-queue:
        # ...
        alarm: alerting@mycompany.com
```

It is possible to configure email alerts in case messages end up in the dead letter queue.

After the first deployment, an email will be sent to the email address to confirm the subscription.

### FIFO (First-In-First-Out)

```yaml
constructs:
    my-queue:
        # ...
        fifo: true
```

[SQS FIFO](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html) queues provide strict message ordering guarantees. Configuring a FIFO queue is as easy as provding the `fifo: true` option on your construct. This will ensure both the main and Dead-Letter-Queue are configured as FIFO.

By default, FIFO queues have [content-based deduplication](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html) enabled by default. It is possible to skip that deduplication behavior by publishing messages to SQS [with deduplication IDs](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html).

### Retries

```yaml
constructs:
    my-queue:
        # ...
        maxRetries: 5
```

*Default: 3 retries.*

SQS retries messages when the Lambda processing it throws an error. The `maxRetries` option configures how many times each message will be retried in case of failure.

Sidenote: errors should not be captured in the code of the `worker` function, else the retry mechanism will not be triggered.

If the message still fails after reaching the max retry count, it will be moved to the dead letter queue for storage.

### Retry delay

When Lambda fails processing an SQS message (i.e. the code throws an error), the message will be retried after a delay. That delay is also called SQS "_Visibility Timeout_".

By default, Lift configures the retry delay to 6 times the worker functions timeout, [per AWS' recommendation](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#events-sqs-queueconfig). Since Serverless deploy functions with a timeout of 6 seconds by default, that means that messages will be retried **every 36 seconds**.

When the function's timeout is changed, the retry delay is automatically changed accordingly:

```yaml
constructs:
    my-queue:
        # ...
        worker:
            handler: src/worker.handler
            # We change the timeout to 10 seconds
            timeout: 10
            # The retry delay on the queue will be 10*6 => 60 seconds
```

### Delivery delay

When a message is sent to the queue, it will be available immediately to the worker.

You can postpone the delivery of messages by a given amount of seconds using the `delay` option.

The maximum value is 900 seconds (15 minutes).

```yaml
constructs:
    my-queue:
        # ...
        # Messages delivery will be delayed by 1 minute
        delay: 60
```

### Encryption

Turn on server-side encryption for the queue.

You can set the `encryption` option to `kmsManaged` to use a SQS managed master key.

```yaml
constructs:
    my-queue:
        # ...
        # Encryption will be enabled and managed by AWS
        encryption: 'kmsManaged'
```

Or you can set it to `kms` and provide your own key via `encryptionKey` option.

```yaml
constructs:
    my-queue:
        # ...
        # Encryption will be enabled and managed by AWS
        encryption: 'kms'
        encryptionKey: 'MySuperSecretKey'
```

### Batch size

```yaml
constructs:
    my-queue:
        # ...
        batchSize: 5 # Lambda will receive 5 messages at a time
```

*Default: 1*

When the SQS queue contains more than 1 message to process, it can invoke Lambda with a batch of multiple messages at once.

By default, Lift configures Lambda to be invoked with 1 messages at a time. The reason is to simplify error handling: in a batch, any failed message will fail the whole batch by default.

Note you can use [partial batch failures](#partial-batch-failures) to avoid failing the whole batch.

It is possible to set the batch size between 1 and 10.

### Maximum Batching Window

```yaml
constructs:
    my-queue:
        # ...
        maxBatchingWindow: 5 # SQS will wait 5 seconds (so that it can batch any messages together) before delivering to lambda
```

*Default: 0 seconds*

The maximum amount of time to gather records before invoking the lambda. This increases the likelihood of a full batch at the cost of delayed processing.

It is possible to set the `maxBatchingWindow` between 0 and 300. 


### Partial batch failures

When using message batches, an error thrown in your worker function would consider the whole batch as failed.

If you want to only consider specific messages of the batch as failed, you need to return a specific format in your worker function.
It contains the identifier of the messages you consider as failed in the `itemIdentifier` key.

```json
{ 
  "batchItemFailures": [ 
        {
            "itemIdentifier": "id2"
        },
        {
            "itemIdentifier": "id4"
        }
    ]
}
```

You can learn more in the [official AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting).


### More options

Looking for more options in the construct configuration? [Open a GitHub issue](https://github.com/getlift/lift/issues/new).
