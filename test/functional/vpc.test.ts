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

    it('should deploy VPC', async function() {
        const output = await runCommand('../../../bin/run export', __dirname + '/vpc');
        assertCloudFormation(output, 'vpc/expected.yaml');
    });

    it('should export VPC variables', async function() {
        const output = await runCommand('../../../bin/run variables', __dirname + '/vpc');
        assert.deepStrictEqual(JSON.parse(output), {});
    });

    it('should export VPC permissions', async function() {
        const output = await runCommand('../../../bin/run permissions', __dirname + '/vpc');
        assert.deepStrictEqual(JSON.parse(output), []);
    });

})
