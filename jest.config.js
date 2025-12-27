const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig");

module.exports = {
    moduleNameMapper: Object.assign(pathsToModuleNameMapper(compilerOptions.paths, { prefix: "<rootDir>" }), {
        axios: "axios/dist/node/axios.cjs",
    }),
    preset: "ts-jest",
    testPathIgnorePatterns: ["dist"],
    testEnvironment: "node",
    testTimeout: 10000,
    transform: {
        "^.+\\.ts$": ["ts-jest"],
    },
};
