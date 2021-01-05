import * as assert from 'assert';
import * as fs from 'fs';
import {test} from '@oclif/test'
import * as yaml from 'js-yaml';

function assertCloudFormation(actual: string, expectedFile: string) {
    let expected = fs.readFileSync(__dirname + '/' + expectedFile).toString();
    // Reformat YAML
    actual = yaml.dump(yaml.safeLoad(actual));
    expected = yaml.dump(yaml.safeLoad(expected));
    assert.deepStrictEqual(actual, expected);
}

describe('lift deploy', () => {

    test
        .stdout()
        .command(['export'])
        .it('should deploy S3 buckets', ctx => {
            assertCloudFormation(ctx.stdout, 'expected.yaml');
        })

    test
        .stdout()
        .command(['variables'])
        .it('should export S3 variables', ctx => {
            assert.deepStrictEqual(JSON.parse(ctx.stdout), {
                BUCKET_AVATARS: "lift-avatars",
            });
        })

})
