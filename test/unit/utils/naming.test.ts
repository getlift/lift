import { ensureNameMaxLength } from "../../../src/utils/naming";

describe("naming", () => {
    it("should not change names shorter than the limit", () => {
        expect(ensureNameMaxLength("foo", 3)).toEqual("foo");
    });

    it("should trim names with a unique suffix to stay under the limit", () => {
        expect(ensureNameMaxLength("foobarfoobarfoobarfoobar", 15)).toEqual("foobarfo-7ca709");
        expect(ensureNameMaxLength("foobarfoobarfoobarfoobar", 15)).toHaveLength(15);
        // The suffix changes based on teh full string to avoid duplicates
        expect(ensureNameMaxLength("foobarfoofoofoofoofoofoo", 15)).not.toEqual("foobarfo-7ca709");
    });
});
