const { pathsToModuleNameMapper } = require("ts-jest/utils");
const { compilerOptions } = require("./tsconfig");

module.exports = {
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: "<rootDir>" }),
    preset: "ts-jest",
    testPathIgnorePatterns: ["dist"],
    testEnvironment: "node",
    testTimeout: 10000,
    globals: {
        "ts-jest": {
            isolatedModules: true,
        },
    },
};
