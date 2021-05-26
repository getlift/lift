module.exports = {
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
