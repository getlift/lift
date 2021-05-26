// The JS SDK is installed by default in Lambda,
// but it can also be installed explicitly (https://github.com/aws/aws-sdk-js)
const AWS = require('aws-sdk');

exports.handler = async function() {
    const sqs = new AWS.SQS({
        apiVersion: 'latest',
        region: process.env.AWS_REGION,
    });

    await sqs.sendMessage({
        QueueUrl: process.env.QUEUE_URL,
        // Any event data we want to send
        MessageBody: JSON.stringify({
            fileName: 'foo/bar.mp4'
        }),
    }).promise();

    const html = '<p>A new message has been pushed into SQS.</p>\n' +
        '<p>This message will be processed in the background by the <code>sqsWorker</code> Lambda function.</p>';

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html',
        },
        body: html,
    };
}
