var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __reExport = (target, module2, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && key !== "default")
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toModule = (module2) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", module2 && module2.__esModule && "default" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
};
__export(exports, {
  pollMessages: () => pollMessages,
  retryMessages: () => retryMessages
});
var import_lodash = __toModule(require("lodash"));
var import_sleep = __toModule(require("../../../utils/sleep"));
var import_logger = __toModule(require("../../../utils/logger"));
async function pollMessages({
  aws,
  queueUrl,
  progressCallback,
  visibilityTimeout
}) {
  const messages = [];
  const promises = [];
  for (let i = 0; i < 3; i++) {
    promises.push(pollMoreMessages(aws, queueUrl, messages, visibilityTimeout).then(() => {
      if (progressCallback && messages.length > 0) {
        progressCallback(messages.length);
      }
    }));
    await (0, import_sleep.sleep)(200);
  }
  await Promise.all(promises);
  return messages;
}
async function pollMoreMessages(aws, queueUrl, messages, visibilityTimeout) {
  var _a;
  const messagesResponse = await aws.request("SQS", "receiveMessage", {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 3,
    VisibilityTimeout: visibilityTimeout != null ? visibilityTimeout : 1
  });
  for (const newMessage of (_a = messagesResponse.Messages) != null ? _a : []) {
    const alreadyInTheList = messages.some((message) => {
      return message.MessageId === newMessage.MessageId;
    });
    if (!alreadyInTheList) {
      messages.push(newMessage);
    }
  }
}
async function retryMessages(aws, queueUrl, dlqUrl, messages) {
  if (messages.length === 0) {
    return {
      numberOfMessagesRetried: 0,
      numberOfMessagesNotRetried: 0,
      numberOfMessagesRetriedButNotDeleted: 0
    };
  }
  const sendBatches = (0, import_lodash.chunk)(messages, 10);
  const sendResults = await Promise.all(sendBatches.map((batch) => aws.request("SQS", "sendMessageBatch", {
    QueueUrl: queueUrl,
    Entries: batch.map((message) => {
      if (message.MessageId === void 0) {
        throw new Error(`Found a message with no ID`);
      }
      return {
        Id: message.MessageId,
        MessageAttributes: message.MessageAttributes,
        MessageBody: message.Body
      };
    })
  })));
  const messagesToDelete = messages.filter((message) => {
    const isMessageInFailedList = sendResults.some(({ Failed }) => Failed.some((failedMessage) => message.MessageId === failedMessage.Id));
    return !isMessageInFailedList;
  });
  const deleteBatches = (0, import_lodash.chunk)(messagesToDelete, 10);
  const deletionResults = await Promise.all(deleteBatches.map((batch) => aws.request("SQS", "deleteMessageBatch", {
    QueueUrl: dlqUrl,
    Entries: batch.map((message) => {
      return {
        Id: message.MessageId,
        ReceiptHandle: message.ReceiptHandle
      };
    })
  })));
  const numberOfMessagesRetried = deletionResults.reduce((total, { Successful }) => total + Successful.length, 0);
  const numberOfMessagesNotRetried = sendResults.reduce((total, { Failed }) => total + Failed.length, 0);
  const numberOfMessagesRetriedButNotDeleted = deletionResults.reduce((total, { Failed }) => total + Failed.length, 0);
  if (numberOfMessagesRetriedButNotDeleted > 0) {
    (0, import_logger.getUtils)().log.warning(`${numberOfMessagesRetriedButNotDeleted} failed messages were not successfully deleted from the dead letter queue. These messages will be retried in the main queue, but they will also still be present in the dead letter queue.`);
  }
  return {
    numberOfMessagesRetried,
    numberOfMessagesNotRetried,
    numberOfMessagesRetriedButNotDeleted
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  pollMessages,
  retryMessages
});
//# sourceMappingURL=sqs.js.map
