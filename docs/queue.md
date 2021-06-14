# Queue

Some tasks are too long to be processed synchronously. Instead, they can be processed in the background via a job queue and worker.

The `queue` construct deploys a properly configured **SQS queue** with a **worker running on AWS Lambda**.

## Quick start

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

To learn more about the architecture of this construct, [read this article](https://medium.com/serverless-transformation/serverless-queues-and-workers-designing-lift-d870afdba867).

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
// src/worker.js
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

When the `publisher` function is invoked, it will be push a message into SQS. SQS will then automatically trigger the `worker` function, which could be written like this:

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

## Commands

The following commands are available on `queue` constructs:

```
serverless <construct-name>:failed
serverless <construct-name>:failed:purge
serverless <construct-name>:failed:retry
```

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

### Batch size

```yaml
constructs:
    my-queue:
        # ...
        batchSize: 5 # Lambda will receive 5 messages at a time
```

*Default: 1*

When the SQS queue contains more than 1 message to process, it can invoke Lambda with a batch of multiple messages at once.

By default, Lift configures Lambda to be invoked with 1 messages at a time. The reason is to simplify error handling: in a batch, any failed message will fail the whole batch.

It is possible to set the batch size between 1 and 10.

### More options

Looking for more options in the construct configuration? [Open a GitHub issue](https://github.com/getlift/lift/issues/new).
