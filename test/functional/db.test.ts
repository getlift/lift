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

describe('db', () => {

    it('should deploy database instances', async function() {
        const output = await runCommand(__dirname + '/db/instance', 'export');
        assertCloudFormation(output, 'db/instance/expected.yaml');
    });

    it('should deploy database clusters', async function() {
        const output = await runCommand(__dirname + '/db/cluster', 'export');
        assertCloudFormation(output, 'db/cluster/expected.yaml');
    });

    it('should deploy serverless databases', async function() {
        const output = await runCommand(__dirname + '/db/serverless', 'export');
        assertCloudFormation(output, 'db/serverless/expected.yaml');
    });

    it('should export database variables', async function() {
        sinon.stub(CloudFormation, 'getOutputs').resolves({
            DatabaseName: 'dbname',
            DatabaseHost: 'dbname.e2sctvp0nqos.us-east-1.rds.amazonaws.com',
            DatabasePort: '3306',
        });

        const output = await runCommand(__dirname + '/db/instance', 'variables');
        assert.deepStrictEqual(JSON.parse(output), {
            DATABASE_HOST: 'dbname.e2sctvp0nqos.us-east-1.rds.amazonaws.com',
            DATABASE_NAME: 'dbname',
            DATABASE_PORT: '3306',
        });
    });

    it('should export database permissions', async function() {
        const output = await runCommand(__dirname + '/db/instance', 'permissions');
        assert.deepStrictEqual(JSON.parse(output), []);
    });

})
