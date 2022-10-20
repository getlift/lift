var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __reExport = (target, module2, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && key !== "default")
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toModule = (module2) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", module2 && module2.__esModule && "default" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
};
var import_path = __toModule(require("path"));
var import_lodash = __toModule(require("lodash"));
var import_runServerless = __toModule(require("../utils/runServerless"));
describe("stripe", () => {
  describe("when an existing STRIPE_API_KEY env is set", () => {
    let serverless;
    beforeAll(async () => {
      ({ serverless } = await (0, import_runServerless.runServerless)({
        fixture: "stripe",
        configExt: import_runServerless.pluginConfigExt,
        command: "package",
        env: {
          STRIPE_API_KEY: "rk_test_key_from_env",
          XDG_CONFIG_HOME: (0, import_path.resolve)(process.cwd(), "test/fixtures/stripe/.config")
        }
      }));
    });
    test.each([
      ["stripeProviderWithProfile", "rk_test_key_from_toml_file"],
      ["stripeProviderWithoutProfile", "rk_test_key_from_env"]
    ])("should source the correct key for provider %p", (useCase, expectedApiKey) => {
      const stripeProvider = serverless.getLiftProviderById(useCase);
      const stripeApiKey = (0, import_lodash.get)(stripeProvider, "sdk._api.auth").slice(7);
      expect(stripeApiKey).toBe(expectedApiKey);
    });
  });
  it("should throw when no STRIPE_API_KEY env is set and one provider has no profile", async () => {
    await expect((0, import_runServerless.runServerless)({
      fixture: "stripe",
      configExt: import_runServerless.pluginConfigExt,
      command: "package",
      env: {
        XDG_CONFIG_HOME: (0, import_path.resolve)(process.cwd(), "test/fixtures/stripe/.config")
      }
    })).rejects.toThrow(/There is no default profile in your stripe configuration/);
  });
});
//# sourceMappingURL=stripe.test.js.map
