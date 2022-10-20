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
  Queue: () => Queue
});
var import_aws_kms = __toModule(require("aws-cdk-lib/aws-kms"));
var import_aws_sqs = __toModule(require("aws-cdk-lib/aws-sqs"));
var import_aws_cloudwatch = __toModule(require("aws-cdk-lib/aws-cloudwatch"));
var import_aws_sns = __toModule(require("aws-cdk-lib/aws-sns"));
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_chalk = __toModule(require("chalk"));
var import_lodash = __toModule(require("lodash"));
var import_ora = __toModule(require("ora"));
var import_child_process = __toModule(require("child_process"));
var inquirer = __toModule(require("inquirer"));
var import_abstracts = __toModule(require("@lift/constructs/abstracts"));
var import_sqs = __toModule(require("./queue/sqs"));
var import_sleep = __toModule(require("../../utils/sleep"));
var import_CloudFormation = __toModule(require("../../CloudFormation"));
var import_error = __toModule(require("../../utils/error"));
var import_logger = __toModule(require("../../utils/logger"));
const QUEUE_DEFINITION = {
  type: "object",
  properties: {
    type: { const: "queue" },
    worker: {
      type: "object",
      properties: {
        timeout: { type: "number" }
      },
      additionalProperties: true
    },
    maxRetries: { type: "number" },
    alarm: { type: "string" },
    batchSize: {
      type: "number",
      minimum: 1,
      maximum: 10
    },
    maxBatchingWindow: {
      type: "number",
      minimum: 0,
      maximum: 300
    },
    fifo: { type: "boolean" },
    delay: { type: "number" },
    encryption: { type: "string" },
    encryptionKey: { type: "string" }
  },
  additionalProperties: false,
  required: ["worker"]
};
const _Queue = class extends import_abstracts.AwsConstruct {
  constructor(scope, id, configuration, provider) {
    super(scope, id);
    this.id = id;
    this.configuration = configuration;
    this.provider = provider;
    var _a, _b;
    if (configuration.worker === void 0) {
      throw new import_error.default(`Invalid configuration in 'constructs.${this.id}': no 'worker' defined. Queue constructs require a 'worker' function to be defined.`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
    }
    const functionTimeout = (_a = configuration.worker.timeout) != null ? _a : 6;
    const visibilityTimeout = functionTimeout * 6 + this.getMaximumBatchingWindow();
    const maxRetries = (_b = configuration.maxRetries) != null ? _b : 3;
    let delay = void 0;
    if (configuration.delay !== void 0) {
      if (configuration.delay < 0 || configuration.delay > 900) {
        throw new import_error.default(`Invalid configuration in 'constructs.${this.id}': 'delay' must be between 0 and 900, '${configuration.delay}' given.`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
      }
      delay = import_aws_cdk_lib.Duration.seconds(configuration.delay);
    }
    let encryption = void 0;
    if ((0, import_lodash.isNil)(configuration.encryption) || configuration.encryption.length === 0) {
      encryption = {};
    } else if (configuration.encryption === "kmsManaged") {
      encryption = { encryption: import_aws_sqs.QueueEncryption.KMS_MANAGED };
    } else if (configuration.encryption === "kms") {
      if ((0, import_lodash.isNil)(configuration.encryptionKey) || configuration.encryptionKey.length === 0) {
        throw new import_error.default(`Invalid configuration in 'constructs.${this.id}': 'encryptionKey' must be set if the 'encryption' is set to 'kms'`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
      }
      encryption = {
        encryption: import_aws_sqs.QueueEncryption.KMS,
        encryptionMasterKey: new import_aws_kms.Key(this, configuration.encryptionKey)
      };
    } else {
      throw new import_error.default(`Invalid configuration in 'constructs.${this.id}': 'encryption' must be one of 'kms', 'kmsManaged', null, '${configuration.encryption}' given.`, "LIFT_INVALID_CONSTRUCT_CONFIGURATION");
    }
    const baseName = `${this.provider.stackName}-${id}`;
    this.dlq = new import_aws_sqs.Queue(this, "Dlq", {
      queueName: configuration.fifo === true ? `${baseName}-dlq.fifo` : `${baseName}-dlq`,
      retentionPeriod: import_aws_cdk_lib.Duration.days(14),
      fifo: configuration.fifo,
      ...encryption
    });
    this.queue = new import_aws_sqs.Queue(this, "Queue", {
      queueName: configuration.fifo === true ? `${baseName}.fifo` : `${baseName}`,
      visibilityTimeout: import_aws_cdk_lib.Duration.seconds(visibilityTimeout),
      deadLetterQueue: {
        maxReceiveCount: maxRetries,
        queue: this.dlq
      },
      fifo: configuration.fifo,
      deliveryDelay: delay,
      contentBasedDeduplication: configuration.fifo,
      ...encryption
    });
    const alarmEmail = configuration.alarm;
    if (alarmEmail !== void 0) {
      const alarmTopic = new import_aws_sns.Topic(this, "AlarmTopic", {
        topicName: `${this.provider.stackName}-${id}-dlq-alarm-topic`,
        displayName: `[Alert][${id}] There are failed jobs in the dead letter queue.`
      });
      new import_aws_sns.Subscription(this, "AlarmTopicSubscription", {
        topic: alarmTopic,
        protocol: import_aws_sns.SubscriptionProtocol.EMAIL,
        endpoint: alarmEmail
      });
      const alarm = new import_aws_cloudwatch.Alarm(this, "Alarm", {
        alarmName: `${this.provider.stackName}-${id}-dlq-alarm`,
        alarmDescription: "Alert triggered when there are failed jobs in the dead letter queue.",
        metric: new import_aws_cloudwatch.Metric({
          namespace: "AWS/SQS",
          metricName: "ApproximateNumberOfMessagesVisible",
          dimensionsMap: {
            QueueName: this.dlq.queueName
          },
          statistic: "Sum",
          period: import_aws_cdk_lib.Duration.minutes(1)
        }),
        evaluationPeriods: 1,
        threshold: 0,
        comparisonOperator: import_aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
      });
      alarm.addAlarmAction({
        bind() {
          return { alarmActionArn: alarmTopic.topicArn };
        }
      });
    }
    this.queueArnOutput = new import_aws_cdk_lib.CfnOutput(this, "QueueArn", {
      description: `ARN of the "${id}" SQS queue.`,
      value: this.queue.queueArn
    });
    this.queueUrlOutput = new import_aws_cdk_lib.CfnOutput(this, "QueueUrl", {
      description: `URL of the "${id}" SQS queue.`,
      value: this.queue.queueUrl
    });
    this.dlqUrlOutput = new import_aws_cdk_lib.CfnOutput(this, "DlqUrl", {
      description: `URL of the "${id}" SQS dead letter queue.`,
      value: this.dlq.queueUrl
    });
    this.appendFunctions();
  }
  outputs() {
    return {
      queueUrl: () => this.getQueueUrl()
    };
  }
  variables() {
    return {
      queueUrl: this.queue.queueUrl,
      queueArn: this.queue.queueArn
    };
  }
  permissions() {
    return [new import_CloudFormation.PolicyStatement("sqs:SendMessage", [this.queue.queueArn])];
  }
  extend() {
    return {
      queue: this.queue.node.defaultChild,
      dlq: this.dlq.node.defaultChild,
      alarm: this.dlq.node.defaultChild
    };
  }
  getMaximumBatchingWindow() {
    var _a;
    return (_a = this.configuration.maxBatchingWindow) != null ? _a : 0;
  }
  appendFunctions() {
    var _a;
    const batchSize = (_a = this.configuration.batchSize) != null ? _a : 1;
    const maximumBatchingWindow = this.getMaximumBatchingWindow();
    this.configuration.worker.events = [
      {
        sqs: {
          arn: this.queue.queueArn,
          batchSize,
          maximumBatchingWindow,
          functionResponseType: "ReportBatchItemFailures"
        }
      }
    ];
    this.provider.addFunction(`${this.id}Worker`, this.configuration.worker);
  }
  async getQueueUrl() {
    return this.provider.getStackOutput(this.queueUrlOutput);
  }
  async getDlqUrl() {
    return this.provider.getStackOutput(this.dlqUrlOutput);
  }
  async listDlq() {
    var _a, _b;
    const dlqUrl = await this.getDlqUrl();
    if (dlqUrl === void 0) {
      throw new import_error.default('Could not find the dead letter queue in the deployed stack. Try running "serverless deploy" first?', "LIFT_MISSING_STACK_OUTPUT");
    }
    const progress = (0, import_logger.getUtils)().progress;
    let progressV2;
    let progressV3;
    if (progress) {
      progressV3 = progress.create({
        message: "Polling failed messages from the dead letter queue"
      });
    } else {
      progressV2 = (0, import_ora.default)("Polling failed messages from the dead letter queue").start();
    }
    const messages = await (0, import_sqs.pollMessages)({
      aws: this.provider,
      queueUrl: dlqUrl,
      progressCallback: (numberOfMessagesFound) => {
        if (progressV2) {
          progressV2.text = `Polling failed messages from the dead letter queue (${numberOfMessagesFound} found)`;
        } else if (progressV3) {
          progressV3.update(`Polling failed messages from the dead letter queue (${numberOfMessagesFound} found)`);
        }
      }
    });
    if (progressV3) {
      progressV3.remove();
    }
    if (messages.length === 0) {
      if (progressV2) {
        progressV2.stopAndPersist({
          symbol: "\u{1F44C}",
          text: "No failed messages found in the dead letter queue"
        });
      } else {
        (0, import_logger.getUtils)().log.success("No failed messages found in the dead letter queue");
      }
      return;
    }
    if (progressV2) {
      progressV2.warn(`${messages.length} messages found in the dead letter queue:`);
    } else {
      (0, import_logger.getUtils)().log(`${messages.length} messages found in the dead letter queue:`);
      (0, import_logger.getUtils)().log();
    }
    for (const message of messages) {
      (0, import_logger.getUtils)().writeText(import_chalk.default.gray(`Message #${(_a = message.MessageId) != null ? _a : "?"}`));
      (0, import_logger.getUtils)().writeText(this.formatMessageBody((_b = message.Body) != null ? _b : ""));
      (0, import_logger.getUtils)().writeText();
    }
    const retryCommand = import_chalk.default.bold(`serverless ${this.id}:failed:retry`);
    const purgeCommand = import_chalk.default.bold(`serverless ${this.id}:failed:purge`);
    (0, import_logger.getUtils)().log(`Run ${retryCommand} to retry all messages, or ${purgeCommand} to delete those messages forever.`);
  }
  async purgeDlq() {
    const dlqUrl = await this.getDlqUrl();
    if (dlqUrl === void 0) {
      throw new import_error.default('Could not find the dead letter queue in the deployed stack. Try running "serverless deploy" first?', "LIFT_MISSING_STACK_OUTPUT");
    }
    const progress = (0, import_logger.getUtils)().progress;
    let progressV2;
    let progressV3;
    if (progress) {
      progressV3 = progress.create({
        message: "Purging the dead letter queue of failed messages"
      });
    } else {
      progressV2 = (0, import_ora.default)("Purging the dead letter queue of failed messages").start();
    }
    await this.provider.request("SQS", "purgeQueue", {
      QueueUrl: dlqUrl
    });
    await (0, import_sleep.sleep)(500);
    if (progressV3) {
      progressV3.remove();
      (0, import_logger.getUtils)().log.success("The dead letter queue has been purged, failed messages are gone \u{1F648}");
    } else if (progressV2) {
      progressV2.succeed("The dead letter queue has been purged, failed messages are gone \u{1F648}");
    }
  }
  async retryDlq() {
    const queueUrl = await this.getQueueUrl();
    const dlqUrl = await this.getDlqUrl();
    if (queueUrl === void 0 || dlqUrl === void 0) {
      throw new import_error.default('Could not find the queue in the deployed stack. Try running "serverless deploy" first?', "LIFT_MISSING_STACK_OUTPUT");
    }
    const progress = (0, import_logger.getUtils)().progress;
    let progressV2;
    let progressV3;
    if (progress) {
      progressV3 = progress.create({
        message: "Moving failed messages from DLQ to the main queue to be retried"
      });
    } else {
      progressV2 = (0, import_ora.default)("Moving failed messages from DLQ to the main queue to be retried").start();
    }
    let shouldContinue = true;
    let totalMessagesToRetry = 0;
    let totalMessagesRetried = 0;
    do {
      const messages = await (0, import_sqs.pollMessages)({
        aws: this.provider,
        queueUrl: dlqUrl,
        visibilityTimeout: 10
      });
      totalMessagesToRetry += messages.length;
      if (progressV3) {
        progressV3.update(`Moving failed messages from DLQ to the main queue to be retried (${totalMessagesRetried}/${totalMessagesToRetry})`);
      } else if (progressV2) {
        progressV2.text = `Moving failed messages from DLQ to the main queue to be retried (${totalMessagesRetried}/${totalMessagesToRetry})`;
      }
      const result = await (0, import_sqs.retryMessages)(this.provider, queueUrl, dlqUrl, messages);
      totalMessagesRetried += result.numberOfMessagesRetried;
      if (progressV3) {
        progressV3.update(`Moving failed messages from DLQ to the main queue to be retried (${totalMessagesRetried}/${totalMessagesToRetry})`);
      } else if (progressV2) {
        progressV2.text = `Moving failed messages from DLQ to the main queue to be retried (${totalMessagesRetried}/${totalMessagesToRetry})`;
      }
      if (result.numberOfMessagesRetriedButNotDeleted > 0 || result.numberOfMessagesNotRetried > 0) {
        if (progressV3) {
          progressV3.remove();
          (0, import_logger.getUtils)().log.error(`There were some errors:`);
        } else if (progressV2) {
          progressV2.fail(`There were some errors:`);
        }
        if (totalMessagesRetried > 0) {
          console.log(`${totalMessagesRetried} failed messages have been successfully moved to the main queue to be retried.`);
        }
        if (result.numberOfMessagesNotRetried > 0) {
          console.log(`${result.numberOfMessagesNotRetried} failed messages could not be retried (for some unknown reason SQS refused to move them). These messages are still in the dead letter queue. Maybe try again?`);
        }
        if (result.numberOfMessagesRetriedButNotDeleted > 0) {
          console.log(`${result.numberOfMessagesRetriedButNotDeleted} failed messages were moved to the main queue, but were not successfully deleted from the dead letter queue. That means that these messages will be retried in the main queue, but they will also still be present in the dead letter queue.`);
        }
        console.log("Stopping now because of the error above. Not all messages have been retried, run the command again to continue.");
        return;
      }
      shouldContinue = result.numberOfMessagesRetried > 0;
    } while (shouldContinue);
    if (totalMessagesToRetry === 0) {
      if (progressV3) {
        progressV3.remove();
        (0, import_logger.getUtils)().log.success("No failed messages found in the dead letter queue");
      } else if (progressV2) {
        progressV2.stopAndPersist({
          symbol: "\u{1F44C}",
          text: "No failed messages found in the dead letter queue"
        });
      }
      return;
    }
    if (progressV3) {
      progressV3.remove();
      (0, import_logger.getUtils)().log.success(`${totalMessagesRetried} failed message(s) moved to the main queue to be retried \u{1F4AA}`);
    } else if (progressV2) {
      progressV2.succeed(`${totalMessagesRetried} failed message(s) moved to the main queue to be retried \u{1F4AA}`);
    }
  }
  async sendMessage(options) {
    const queueUrl = await this.getQueueUrl();
    if (queueUrl === void 0) {
      throw new import_error.default('Could not find the queue in the deployed stack. Try running "serverless deploy" first?', "LIFT_MISSING_STACK_OUTPUT");
    }
    if (this.configuration.fifo === true && typeof options["group-id"] !== "string") {
      throw new import_error.default(`The '${this.id}' queue is a FIFO queue. You must set the SQS message group ID via the '--group-id' option.`, "LIFT_MISSING_CLI_OPTION");
    }
    const body = typeof options.body === "string" ? options.body : await this.askMessageBody();
    const params = {
      QueueUrl: queueUrl,
      MessageBody: body
    };
    if (this.configuration.fifo === true) {
      params.MessageGroupId = options["group-id"];
    }
    await this.provider.request("SQS", "sendMessage", params);
    (0, import_logger.getUtils)().log.success("Message sent to SQS");
  }
  displayLogs(options) {
    const args = ["logs", "--function", `${this.id}Worker`];
    for (const [option, value] of Object.entries(options)) {
      args.push(option.length === 1 ? `-${option}` : `--${option}`);
      if (typeof value === "string") {
        args.push(value);
      }
    }
    (0, import_logger.getUtils)().log(import_chalk.default.gray(`serverless ${args.join(" ")}`));
    args.unshift(process.argv[1]);
    (0, import_child_process.spawnSync)(process.argv[0], args, {
      cwd: process.cwd(),
      stdio: "inherit"
    });
  }
  formatMessageBody(body) {
    try {
      const data = JSON.parse(body);
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return body;
    }
  }
  async askMessageBody() {
    const responses = await inquirer.prompt({
      message: "What is the body of the SQS message to send (can be JSON or any string)",
      type: "editor",
      name: "body",
      validate: (input) => {
        return input.length > 0 ? true : "The message body cannot be empty";
      }
    });
    return responses.body.trim();
  }
};
let Queue = _Queue;
Queue.type = "queue";
Queue.schema = QUEUE_DEFINITION;
Queue.commands = {
  logs: {
    usage: "Output the logs of the queue's worker function",
    handler: _Queue.prototype.displayLogs,
    options: {
      tail: {
        usage: "Tail the log output",
        shortcut: "t",
        type: "boolean"
      },
      startTime: {
        usage: "Logs before this time will not be displayed. Default: `10m` (last 10 minutes logs only)",
        type: "string"
      },
      filter: {
        usage: "A filter pattern",
        type: "string"
      },
      interval: {
        usage: "Tail polling interval in milliseconds. Default: `1000`",
        shortcut: "i",
        type: "string"
      }
    }
  },
  send: {
    usage: "Send a new message to the SQS queue",
    handler: _Queue.prototype.sendMessage,
    options: {
      body: {
        usage: "Body of the SQS message",
        type: "string"
      },
      "group-id": {
        usage: "This parameter applies only to FIFO (first-in-first-out) queues. The ID that specifies that a message belongs to a specific message group.",
        type: "string"
      }
    }
  },
  failed: {
    usage: "List failed messages from the dead letter queue",
    handler: _Queue.prototype.listDlq
  },
  "failed:purge": {
    usage: "Purge failed messages from the dead letter queue",
    handler: _Queue.prototype.purgeDlq
  },
  "failed:retry": {
    usage: "Retry failed messages from the dead letter queue by moving them to the main queue",
    handler: _Queue.prototype.retryDlq
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Queue
});
//# sourceMappingURL=Queue.js.map
