const sqs = require('@aws-cdk/aws-sqs');
const cdk = require('@aws-cdk/core');

class CustomConstruct extends cdk.Construct {
    static schema = {
        type: "object",
        properties: {
            retention: { type: "number" },
        },
        additionalProperties: false,
        required: [],
    };

    static create(provider, id, configuration) {
        return new this(provider.stack, id, configuration, provider);
    }

    constructor(app, id, configuration, provider) {
        super(app, id);

        new sqs.Queue(this, "Queue", {
            queueName: `${provider.stackName}-${id}`,
            retentionPeriod: cdk.Duration.days(configuration.retention),
        });
    }

    outputs() {
        return {};
    }

    references() {
        return {};
    }
}

module.exports = CustomConstruct
