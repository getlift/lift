module.exports = class ExtraPlugin {
    constructor() {
        // V3 variable mechanism
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
        };
        // Old variable mechanism
        this.variableResolvers = {
            "custom-var-3": () => Promise.resolve("Custom variable 3"),
            "custom-var-4": {
                resolver: () => Promise.resolve("Custom variable 4"),
                serviceName: "dunno what that key is for",
                isDisabledAtPrepopulation: true,
            },
        };
    }
};
