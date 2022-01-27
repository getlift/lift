module.exports = class ExtraPlugin {
    constructor() {
        this.configurationVariablesSources = {
            "custom-var-1": {
                resolve: () => {
                    return {
                        value: "Custom variable 1",
                    };
                },
            },
            "custom-var-2": {
                // Async resolver replicating the Dashboard Plugin implementation
                // https://github.com/serverless/dashboard-plugin/blob/ea662fcf03e8f2f5c1f435d24249c72025a24dbf/lib/plugin.js#L180-L194
                async resolve() {
                    return {
                        value: await (async () => {
                            return Promise.resolve("Custom variable 2");
                        })(),
                    };
                },
            },
            "custom-arn": {
                // Async resolver replicating the Dashboard Plugin implementation
                // https://github.com/serverless/dashboard-plugin/blob/ea662fcf03e8f2f5c1f435d24249c72025a24dbf/lib/plugin.js#L180-L194
                async resolve() {
                    return {
                        value: await (async () => {
                            return Promise.resolve(
                                "arn:aws:acm:us-east-1:123466615250:certificate/abcdef-b896-4725-96e3-6f143d06ac0b"
                            );
                        })(),
                    };
                },
            },
        };
    }
};
