var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
__export(exports, {
  StripeProvider: () => StripeProvider
});
var import_fs = __toModule(require("fs"));
var import_os = __toModule(require("os"));
var import_path = __toModule(require("path"));
var import_toml = __toModule(require("toml"));
var import_lodash = __toModule(require("lodash"));
var import_stripe = __toModule(require("stripe"));
var import_error = __toModule(require("../utils/error"));
const STRIPE_DEFINITION = {
  type: "object",
  properties: {
    profile: { type: "string" }
  },
  additionalProperties: false
};
const _StripeProvider = class {
  constructor(serverless, id, profile) {
    this.serverless = serverless;
    this.id = id;
    this.config = this.resolveConfiguration(profile);
    this.sdk = new import_stripe.Stripe(this.config.apiKey, { apiVersion: "2020-08-27" });
  }
  static registerConstructs(...constructClasses) {
    for (const constructClass of constructClasses) {
      if (constructClass.type in this.constructClasses) {
        throw new import_error.default(`The construct type '${constructClass.type}' was registered twice`, "LIFT_CONSTRUCT_TYPE_CONFLICT");
      }
      this.constructClasses[constructClass.type] = constructClass;
    }
  }
  static getConstructClass(type) {
    return this.constructClasses[type];
  }
  static getAllConstructClasses() {
    return Object.values(this.constructClasses);
  }
  static create(serverless, id, { profile }) {
    return new this(serverless, id, profile);
  }
  createConstruct(type, id) {
    const Construct = _StripeProvider.getConstructClass(type);
    if (Construct === void 0) {
      throw new import_error.default(`The construct '${id}' has an unknown type '${type}'
Find all construct types available here: https://github.com/getlift/lift#constructs`, "LIFT_UNKNOWN_CONSTRUCT_TYPE");
    }
    const configuration = (0, import_lodash.get)(this.serverless.configurationInput.constructs, id, {});
    return Construct.create(this, id, configuration);
  }
  resolveConfiguration(profile) {
    var _a;
    if (profile === void 0 && typeof process.env.STRIPE_API_KEY === "string") {
      return { apiKey: process.env.STRIPE_API_KEY };
    }
    const configsPath = (_a = process.env.XDG_CONFIG_HOME) != null ? _a : (0, import_path.resolve)((0, import_os.homedir)(), ".config");
    const stripeConfigFilePath = (0, import_path.resolve)(configsPath, "stripe/config.toml");
    if (!(0, import_fs.existsSync)(stripeConfigFilePath)) {
      throw new import_error.default("Could not source any Stripe configuration. Have you set your STRIPE_API_KEY environment?", "STRIPE_MISSING_CONFIGURATION");
    }
    const stripeConfigurationFileContent = (0, import_fs.readFileSync)(stripeConfigFilePath);
    const stripeConfigurations = (0, import_toml.parse)(stripeConfigurationFileContent.toString());
    if (profile !== void 0) {
      if (!(0, import_lodash.has)(stripeConfigurations, profile)) {
        throw new import_error.default(`There is no ${profile} profile in your stripe configuration. Found profiles are ${Object.keys(stripeConfigurations).filter((stripeConfiguration) => stripeConfiguration !== "color").join(", ")}`, "STRIPE_MISSING_PROFILE");
      }
      const stripeConfig = stripeConfigurations[profile];
      return {
        apiKey: stripeConfig.test_mode_api_key,
        accountId: stripeConfig.account_id
      };
    }
    if (!(0, import_lodash.has)(stripeConfigurations, "default")) {
      throw new import_error.default(`There is no default profile in your stripe configuration. Please provide one of the found profiles: ${Object.keys(stripeConfigurations).filter((stripeConfiguration) => stripeConfiguration !== "color").join(", ")}`, "STRIPE_MISSING_DEFAULT_PROFILE");
    }
    const defaultStripeConfig = stripeConfigurations.default;
    return {
      apiKey: defaultStripeConfig.test_mode_api_key,
      accountId: defaultStripeConfig.account_id
    };
  }
};
let StripeProvider = _StripeProvider;
StripeProvider.type = "stripe";
StripeProvider.schema = STRIPE_DEFINITION;
StripeProvider.constructClasses = {};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  StripeProvider
});
//# sourceMappingURL=StripeProvider.js.map
