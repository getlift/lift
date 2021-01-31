import * as assert from 'assert';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import sinon from 'sinon';
import * as CloudFormation from '../../src/aws/CloudFormation';
import {runCommand} from '../../src/tests/helper';

function assertCloudFormation(actual: string, expectedFile: string) {
    let expected = fs.readFileSync(__dirname + '/' + expectedFile).toString();
    // Reformat YAML
    actual = yaml.dump(yaml.safeLoad(actual));
    expected = yaml.dump(yaml.safeLoad(expected));
    assert.deepStrictEqual(actual, expected);
}

afterEach(() => {
    sinon.restore();
});

describe('lift deploy', () => {

    it('should deploy SQS queues', async function() {
        const output = await runCommand(__dirname + '/queues', 'export');
        assertCloudFormation(output, 'queues/expected.yaml');
    });

    it('should export SQS variables', async function() {
        sinon.stub(CloudFormation, 'getOutputs').resolves({
            JobsQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/app-jobs',
            JobsQueueArn: 'arn:aws:sqs:us-east-1:444455556666:app-jobs',
        });

        const output = await runCommand(__dirname + '/queues', 'variables');
        assert.deepStrictEqual(JSON.parse(output), {
            QUEUE_JOBS: 'app-jobs',
            QUEUE_JOBS_URL: 'https://sqs.us-east-1.amazonaws.com/123456789012/app-jobs',
        });
    });

    it('should export SQS permissions', async function() {
        sinon.stub(CloudFormation, 'getOutputs').resolves({
            JobsQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/app-jobs',
            JobsQueueArn: 'arn:aws:sqs:us-east-1:444455556666:app-jobs',
        });

        const output = await runCommand(__dirname + '/queues', 'permissions');
        assert.deepStrictEqual(JSON.parse(output), [
            {
                Effect: 'Allow',
                Action: 'sqs:SendMessage',
                Resource: 'arn:aws:sqs:us-east-1:444455556666:app-jobs',
            },
        ])
    });

})
