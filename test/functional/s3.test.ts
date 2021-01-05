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

    it('should deploy S3 buckets', async function() {
        const output = await runCommand(__dirname + '/s3', 'export');
        assertCloudFormation(output, 's3/expected.yaml');
    });

    it('should export S3 variables', async function() {
        const output = await runCommand(__dirname + '/s3', 'variables');
        assert.deepStrictEqual(JSON.parse(output), {
            BUCKET_AVATARS: 'app-avatars',
        });
    });

    it('should export S3 permissions', async function() {
        sinon.stub(CloudFormation, 'getOutputs').resolves({
            AvatarsBucketArn: 'arn:aws:s3:::app-avatars',
        });

        const output = await runCommand(__dirname + '/s3', 'permissions');
        assert.deepStrictEqual(JSON.parse(output), [
            {
                Effect: 'Allow',
                Action: 's3:*',
                Resource: [
                    'arn:aws:s3:::app-avatars',
                    'arn:aws:s3:::app-avatars/*',
                ],
            },
        ])
    });

})
