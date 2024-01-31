const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig");

module.exports = {
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: "<rootDir>" }),
    preset: "ts-jest",
    testPathIgnorePatterns: ["dist"],
    testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.ts?$",
    testEnvironment: "node",
    testTimeout: 10000,
    globals: {
        "ts-jest": {
            isolatedModules: true,
        },
    },
};
