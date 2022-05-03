import { pluginConfigExt, runServerless } from "../utils/runServerless";

describe("extensions", () => {
    it("should error if wrong extension key is used", async () => {
        await expect(() => {
            return runServerless({
                fixture: "extensions",
                configExt: pluginConfigExt,
                command: "package",
            });
        }).rejects.toThrowError(
            "There is no extension 'notExisting' available on this construct. Available extensions are: bucket."
        );
    });
});
