import * as assert from 'assert';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {runCommand} from '../../src/tests/helper';
import sinon from 'sinon';

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

    it('should deploy VPC', async function() {
        const output = await runCommand(__dirname + '/vpc', 'export');
        assertCloudFormation(output, 'vpc/expected.yaml');
    });

    it('should export VPC variables', async function() {
        const output = await runCommand(__dirname + '/vpc', 'variables');
        assert.deepStrictEqual(JSON.parse(output), {});
    });

    it('should export VPC permissions', async function() {
        const output = await runCommand(__dirname + '/vpc', 'permissions');
        assert.deepStrictEqual(JSON.parse(output), []);
    });

})
