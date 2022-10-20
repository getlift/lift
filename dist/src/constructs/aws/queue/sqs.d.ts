import type { Message } from "aws-sdk/clients/sqs";
import type { AwsProvider } from "@lift/providers";
declare type ProgressCallback = (numberOfMessagesFound: number) => void;
export declare function pollMessages({ aws, queueUrl, progressCallback, visibilityTimeout, }: {
    aws: AwsProvider;
    queueUrl: string;
    progressCallback?: ProgressCallback;
    visibilityTimeout?: number;
}): Promise<Message[]>;
export declare function retryMessages(aws: AwsProvider, queueUrl: string, dlqUrl: string, messages: Message[]): Promise<{
    numberOfMessagesRetried: number;
    numberOfMessagesNotRetried: number;
    numberOfMessagesRetriedButNotDeleted: number;
}>;
export {};
