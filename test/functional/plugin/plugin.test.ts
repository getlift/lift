import * as assert from 'assert';
import {spawn} from 'child_process';
import * as fs from 'fs';

const run = async (command: string) => {
    return new Promise(async (resolve, reject) => {
        const process = spawn(command, {
            shell: true,
        });
        let output = '';
        process.stdout.on('data', data => output += data);
        process.stderr.on('data', data => output += data);
        process.on('data', data => resolve(data));
        process.on('error', err => reject(new Error(`Exit code: ${err}\n` + output)));
        process.on('close', err => {
            if (err === 0) {
                resolve(output);
            } else {
                reject(new Error(`Exit code: ${err}\n` + output));
            }
        });
    });
};
const slsPackage = async () => {
    await run(`cd ${__dirname} && serverless package`);
}
function loadFile(path: string): any {
    let json = fs.readFileSync(__dirname + '/' + path).toString();
    // Remove timestamps to allow to make a stable diff
    json = json.replace(/serverless\/app\/dev\/[^/]+\/app\.zip/, 'serverless/app/dev/.../app\.zip');
    return JSON.parse(json);
}

beforeEach(async () => {
    await run(`cd ${__dirname}/../../.. && make plugin`);
});

describe('serverless plugin', () => {
    it('should add CloudFormation resources', async function() {
        await slsPackage();
        const actual = loadFile('.serverless/cloudformation-template-update-stack.json');
        const expected = loadFile('expected.json');
        assert.deepStrictEqual(actual, expected);
    });
})
