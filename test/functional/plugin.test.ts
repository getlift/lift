import * as assert from "assert";
import * as fs from "fs";
import { execute } from "../../src/tests/helper";

const slsPackage = async (directory: string) => {
    await execute("serverless package", __dirname + "/" + directory);
};
function loadFile(path: string): Record<string, unknown> {
    let json = fs.readFileSync(__dirname + "/" + path).toString();
    // Remove timestamps to allow to make a stable diff
    json = json.replace(
        /serverless\/app\/dev\/[^/]+\/app\.zip/,
        "serverless/app/dev/.../app.zip"
    );

    return JSON.parse(json) as Record<string, unknown>;
}

beforeEach(async () => {
    // Compile the plugin to JS code
    await execute("make plugin", `${__dirname}/../..`);
});

describe("serverless plugin", () => {
    it("should add S3 resources", async function () {
        await slsPackage("s3");
        const actual = loadFile(
            "s3/.serverless/cloudformation-template-update-stack.json"
        );
        const expected = loadFile("s3/expected.json");
        assert.deepStrictEqual(actual, expected);
    });

    it("should add static website resources", async function () {
        await slsPackage("static-website");
        const actual = loadFile(
            "static-website/.serverless/cloudformation-template-update-stack.json"
        );
        const expected = loadFile("static-website/expected.json");
        assert.deepStrictEqual(actual, expected);
    });
});
