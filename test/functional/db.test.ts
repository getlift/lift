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

    it('should deploy database', async function() {
        const output = await runCommand('../../../bin/run export', __dirname + '/db');
        assertCloudFormation(output, 'db/expected.yaml');
    });

    // it('should export database variables', async function() {
    //     const output = await runCommand('../../../bin/run variables', __dirname + '/db');
    //     assert.deepStrictEqual(JSON.parse(output), {});
    // });

    it('should export database permissions', async function() {
        const output = await runCommand('../../../bin/run permissions', __dirname + '/db');
        assert.deepStrictEqual(JSON.parse(output), []);
    });

})
