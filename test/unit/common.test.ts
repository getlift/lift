import { baseConfig, pluginConfigExt, runServerless } from "../utils/runServerless";

describe("common", () => {
    it("should explicitly require a type for each construct", async () => {
        await expect(
            runServerless({
                command: "package",
                config: Object.assign(baseConfig, {
                    constructs: {
                        avatars: {},
                    },
                }),
            })
        ).rejects.toThrow(/The construct 'avatars' has no 'type' defined.*/g);
    });

    it("should not override user defined resources in serverless.yml", async () => {
        const { cfTemplate } = await runServerless({
            fixture: "common",
            configExt: pluginConfigExt,
            command: "package",
        });
        expect(cfTemplate.Resources).toMatchObject({
            UserDefinedResource: {},
        });
    });

    it("should validate construct configuration", async () => {
        // Valid config: should not throw
        await runServerless({
            command: "package",
            config: Object.assign(baseConfig, {
                constructs: {
                    avatars: {
                        type: "storage",
                    },
                },
            }),
        });
        // Invalid config: invalid property
        await expect(
            runServerless({
                command: "package",
                config: Object.assign(baseConfig, {
                    constructs: {
                        avatars: {
                            type: "storage",
                            foo: "bar",
                        },
                    },
                }),
            })
        ).rejects.toThrow(/Configuration error at 'constructs\.avatars'.*/g);
        // Invalid config: valid property, but in the wrong construct
        await expect(
            runServerless({
                command: "package",
                config: Object.assign(baseConfig, {
                    constructs: {
                        avatars: {
                            type: "storage",
                            // "path" is a valid property in the `static-website` construct
                            path: ".",
                        },
                    },
                }),
            })
        ).rejects.toThrow(/Configuration error at 'constructs\.avatars'.*/g);
    });
});
