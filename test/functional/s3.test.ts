import * as assert from 'assert';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {runCommand} from '../../src/tests/helper';

function assertCloudFormation(actual: string, expectedFile: string) {
    let expected = fs.readFileSync(__dirname + '/' + expectedFile).toString();
    // Reformat YAML
    actual = yaml.dump(yaml.safeLoad(actual));
    expected = yaml.dump(yaml.safeLoad(expected));
    assert.deepStrictEqual(actual, expected);
}

describe('lift deploy', () => {

    it('should deploy S3 buckets', async function() {
        const output = await runCommand('../../../bin/run export', __dirname + '/s3');
        assertCloudFormation(output, 's3/expected.yaml');
    });

    it('should export S3 variables', async function() {
        const output = await runCommand('../../../bin/run variables', __dirname + '/s3');
        assert.deepStrictEqual(JSON.parse(output), {
            BUCKET_AVATARS: 'app-avatars',
        });
    });

    // Requires deployed stack
    // it('should export S3 permissions', async function() {
    //     const output = await runCommand('../../../bin/run permissions', __dirname + '/s3');
    //     assert.deepStrictEqual(JSON.parse(output), [
    //         {
    //             Effect: 'Allow',
    //             Action: 's3:*',
    //             Resource: [
    //                 'arn:aws:s3:::app-avatars',
    //                 'arn:aws:s3:::app-avatars/*',
    //             ],
    //         },
    //     ]);
    // });

})
