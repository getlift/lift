import {
    DeleteMessageBatchRequest,
    DeleteMessageBatchResult,
    Message,
    ReceiveMessageRequest,
    ReceiveMessageResult,
    SendMessageBatchRequest,
    SendMessageBatchResult,
} from "aws-sdk/clients/sqs";
import { AwsProvider } from "../../providers";
import { log } from "../../utils/logger";
import { sleep } from "../../utils/sleep";

type ProgressCallback = (numberOfMessagesFound: number) => void;

export async function pollMessages({
    aws,
    queueUrl,
    progressCallback,
    visibilityTimeout,
}: {
    aws: AwsProvider;
    queueUrl: string;
    progressCallback?: ProgressCallback;
    visibilityTimeout?: number;
}): Promise<Message[]> {
    const messages: Message[] = [];
    const promises = [];
    /**
     * Poll in parallel to hit multiple SQS servers at once
     * See https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html
     * and https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html
     * (a single request might not return all messages)
     */
    for (let i = 0; i < 3; i++) {
        promises.push(
            pollMoreMessages(aws, queueUrl, messages, visibilityTimeout).then(() => {
                if (progressCallback && messages.length > 0) {
                    progressCallback(messages.length);
                }
            })
        );
        await sleep(200);
    }
    await Promise.all(promises);

    return messages;
}

async function pollMoreMessages(
    aws: AwsProvider,
    queueUrl: string,
    messages: Message[],
    visibilityTimeout?: number
): Promise<void> {
    const messagesResponse = await aws.request<ReceiveMessageRequest, ReceiveMessageResult>("SQS", "receiveMessage", {
        QueueUrl: queueUrl,
        // 10 is the maximum
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 3,
        // By default only hide messages for 1 second to avoid disrupting the queue too much
        VisibilityTimeout: visibilityTimeout ?? 1,
    });
    for (const newMessage of messagesResponse.Messages ?? []) {
        const alreadyInTheList = messages.some((message) => {
            return message.MessageId === newMessage.MessageId;
        });
        if (!alreadyInTheList) {
            messages.push(newMessage);
        }
    }
}

export async function retryMessages(
    aws: AwsProvider,
    queueUrl: string,
    dlqUrl: string,
    messages: Message[]
): Promise<{
    numberOfMessagesRetried: number;
    numberOfMessagesNotRetried: number;
    numberOfMessagesRetriedButNotDeleted: number;
}> {
    if (messages.length === 0) {
        return {
            numberOfMessagesRetried: 0,
            numberOfMessagesNotRetried: 0,
            numberOfMessagesRetriedButNotDeleted: 0,
        };
    }

    const sendResult = await aws.request<SendMessageBatchRequest, SendMessageBatchResult>("SQS", "sendMessageBatch", {
        QueueUrl: queueUrl,
        Entries: messages.map((message) => {
            if (message.MessageId === undefined) {
                throw new Error(`Found a message with no ID`);
            }

            return {
                Id: message.MessageId,
                MessageAttributes: message.MessageAttributes,
                MessageBody: message.Body as string,
            };
        }),
    });
    const messagesToDelete = messages.filter((message) => {
        const isMessageInFailedList = sendResult.Failed.some((failedMessage) => message.MessageId === failedMessage.Id);

        return !isMessageInFailedList;
    });

    const deletionResult = await aws.request<DeleteMessageBatchRequest, DeleteMessageBatchResult>(
        "SQS",
        "deleteMessageBatch",
        {
            QueueUrl: dlqUrl,
            Entries: messagesToDelete.map((message) => {
                return {
                    Id: message.MessageId as string,
                    ReceiptHandle: message.ReceiptHandle as string,
                };
            }),
        }
    );
    if (deletionResult.Failed.length > 0) {
        log(
            `${deletionResult.Failed.length} failed messages were not successfully deleted from the dead letter queue. These messages will be retried in the main queue, but they will also still be present in the dead letter queue.`
        );
    }

    return {
        numberOfMessagesRetried: deletionResult.Successful.length,
        numberOfMessagesNotRetried: sendResult.Failed.length,
        numberOfMessagesRetriedButNotDeleted: deletionResult.Failed.length,
    };
}
