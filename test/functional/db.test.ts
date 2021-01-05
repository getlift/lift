import * as assert from 'assert';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {runCommand} from '../../src/tests/helper';
import sinon from 'sinon';
import * as CloudFormation from '../../src/aws/CloudFormation';

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

    it('should deploy database', async function() {
        const output = await runCommand(__dirname + '/db', 'export');
        assertCloudFormation(output, 'db/expected.yaml');
    });

    it('should export database variables', async function() {
        sinon.stub(CloudFormation, 'getOutputs').resolves({
            DatabaseName: 'dbname',
            DatabaseHost: 'dbname.e2sctvp0nqos.us-east-1.rds.amazonaws.com',
            DatabasePort: '3306',
        });

        const output = await runCommand(__dirname + '/db', 'variables');
        assert.deepStrictEqual(JSON.parse(output), {
            DATABASE_HOST: 'dbname.e2sctvp0nqos.us-east-1.rds.amazonaws.com',
            DATABASE_NAME: 'dbname',
            DATABASE_PORT: '3306',
        });
    });

    it('should export database permissions', async function() {
        const output = await runCommand(__dirname + '/db', 'permissions');
        assert.deepStrictEqual(JSON.parse(output), []);
    });

})
