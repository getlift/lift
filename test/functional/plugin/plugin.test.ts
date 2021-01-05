import * as assert from 'assert';
import * as fs from 'fs';
import {runCommand} from '../../../src/tests/helper';

const slsPackage = async () => {
    await runCommand('serverless package', __dirname);
}
function loadFile(path: string): any {
    let json = fs.readFileSync(__dirname + '/' + path).toString();
    // Remove timestamps to allow to make a stable diff
    json = json.replace(/serverless\/app\/dev\/[^/]+\/app\.zip/, 'serverless/app/dev/.../app\.zip');
    return JSON.parse(json);
}

beforeEach(async () => {
    // Compile the plugin to JS code
    await runCommand('make plugin', `${__dirname}/../../..`);
});

describe('serverless plugin', () => {
    it('should add CloudFormation resources', async function() {
        await slsPackage();
        const actual = loadFile('.serverless/cloudformation-template-update-stack.json');
        const expected = loadFile('expected.json');
        assert.deepStrictEqual(actual, expected);
    });
})
