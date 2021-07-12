import { StripeProvider } from "../../src/providers";

describe("stripe", () => {
    it("should source local configuration", () => {
        // @ts-expect-error no serverless mock
        const provider = new StripeProvider({});
        expect(provider.config).toBe(12);
    });
});
