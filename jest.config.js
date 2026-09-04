const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig");

module.exports = {
    moduleNameMapper: Object.assign(pathsToModuleNameMapper(compilerOptions.paths, { prefix: "<rootDir>" }), {
        axios: "axios/dist/node/axios.cjs",
        filenamify: "<rootDir>/test/utils/filenamify.ts",
        "https-proxy-agent": "<rootDir>/test/utils/httpsProxyAgent.ts",
        // OSLS 4.1+ removed telemetry, but `@serverless/test` still resolves this module to stub it
        "^.*/node_modules/(osls|serverless)/lib/utils/telemetry/are-disabled$":
            "<rootDir>/test/utils/telemetryAreDisabled.ts",
    }),
    preset: "ts-jest",
    testPathIgnorePatterns: ["dist"],
    testEnvironment: "node",
    // Tests run the whole Serverless CLI and synthesize a CDK app: the first test of each
    // file also pays for loading aws-cdk-lib, which takes over 10s on slow CI runners.
    testTimeout: 60000,
};
