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
__markAsModule(exports);
var import_lodash = __toModule(require("lodash"));
var path = __toModule(require("path"));
var import_fs = __toModule(require("fs"));
var import_js_yaml = __toModule(require("js-yaml"));
var import_aws_cdk_lib = __toModule(require("aws-cdk-lib"));
var import_providers = __toModule(require("@lift/providers"));
var import_chalk = __toModule(require("chalk"));
var import_logger = __toModule(require("./utils/logger"));
var import_error = __toModule(require("./utils/error"));
const PROVIDER_ID_PATTERN = "^[a-zA-Z0-9-_]+$";
const DEFAULT_PROVIDER = "defaultAwsProvider";
const PROVIDERS_DEFINITION = {
  type: "object",
  patternProperties: {
    [PROVIDER_ID_PATTERN]: {
      allOf: [
        {
          type: "object",
          properties: {
            type: { type: "string" }
          },
          required: ["type"]
        }
      ]
    }
  },
  additionalProperties: false
};
const CONSTRUCT_ID_PATTERN = "^[a-zA-Z0-9-_]+$";
const CONSTRUCTS_DEFINITION = {
  type: "object",
  patternProperties: {
    [CONSTRUCT_ID_PATTERN]: {
      allOf: [
        {
          type: "object",
          properties: {
            type: { type: "string" },
            provider: { type: "string" },
            extensions: { type: "object" }
          },
          required: ["type"]
        }
      ]
    }
  },
  additionalProperties: false
};
const LIFT_CONFIG_SCHEMA = {
  type: "object",
  properties: {
    automaticPermissions: { type: "boolean" }
  },
  additionalProperties: false
};
const _LiftPlugin = class {
  constructor(serverless, cliOptions, utils) {
    this.providersSchema = PROVIDERS_DEFINITION;
    this.constructsSchema = CONSTRUCTS_DEFINITION;
    this.commands = {};
    this.serverless = serverless;
    (0, import_logger.setUtils)(utils);
    Object.assign(this.serverless, { getLiftProviderById: this.getLiftProviderById.bind(this) });
    this.cliOptions = cliOptions;
    this.commands.lift = {
      commands: {
        eject: {
          usage: "Eject Lift constructs to raw CloudFormation",
          lifecycleEvents: ["eject"]
        }
      }
    };
    this.hooks = {
      initialize: () => {
        this.loadConstructs();
        this.appendPermissions();
        this.resolveLazyVariables();
      },
      "before:aws:info:displayStackOutputs": this.info.bind(this),
      "after:package:compileEvents": this.appendCloudformationResources.bind(this),
      "after:deploy:deploy": this.postDeploy.bind(this),
      "before:remove:remove": this.preRemove.bind(this),
      "lift:eject:eject": this.eject.bind(this)
    };
    this.configurationVariablesSources = {
      construct: {
        resolve: this.resolveReference.bind(this)
      }
    };
    this.variableResolvers = {
      construct: (fullVariable) => {
        const address = fullVariable.split(":")[1];
        return Promise.resolve(this.resolveReference({ address }).value);
      }
    };
    this.providers = { [DEFAULT_PROVIDER]: new import_providers.AwsProvider(this.serverless) };
    this.loadProviders();
    this.registerConstructsSchema();
    this.registerProvidersSchema();
    this.registerConfigSchema();
    this.registerCommands();
  }
  registerConstructsSchema() {
    this.constructsSchema.patternProperties[CONSTRUCT_ID_PATTERN].allOf.push({
      oneOf: this.getAllConstructClasses().map((Construct) => {
        return (0, import_lodash.merge)(this.defineSchemaWithType(Construct.type, Construct.schema), {
          properties: { extensions: { type: "object" } }
        });
      })
    });
  }
  registerProvidersSchema() {
    this.providersSchema.patternProperties[PROVIDER_ID_PATTERN].allOf.push({
      oneOf: _LiftPlugin.getAllProviderClasses().map((Provider) => {
        return this.defineSchemaWithType(Provider.type, Provider.schema);
      })
    });
  }
  defineSchemaWithType(type, configSchema) {
    return (0, import_lodash.merge)({}, configSchema, { properties: { type: { const: type } } });
  }
  registerConfigSchema() {
    this.serverless.configSchemaHandler.defineTopLevelProperty("lift", LIFT_CONFIG_SCHEMA);
    this.serverless.configSchemaHandler.defineTopLevelProperty("constructs", this.constructsSchema);
    this.serverless.configSchemaHandler.defineTopLevelProperty("providers", this.providersSchema);
  }
  static registerProviders(...providerClasses) {
    for (const providerClass of providerClasses) {
      if (providerClass.type in this.providerClasses) {
        throw new import_error.default(`The provider type '${providerClass.type}' was registered twice`, "LIFT_PROVIDER_TYPE_CONFLICT");
      }
      this.providerClasses[providerClass.type] = providerClass;
    }
  }
  static getProviderClass(type) {
    return this.providerClasses[type];
  }
  static getAllProviderClasses() {
    return Object.values(this.providerClasses);
  }
  loadProviders() {
    const providersInputConfiguration = (0, import_lodash.get)(this.serverless.configurationInput, "providers", {});
    for (const [id, { type }] of Object.entries(providersInputConfiguration)) {
      this.providers[id] = this.createProvider(type, id);
    }
  }
  createProvider(type, id) {
    if (type === import_providers.AwsProvider.type) {
      throw new import_error.default("AwsProvider is not configurable via providers", "LIFT_AWS_PROVIDER_CONFIGURATION");
    }
    const Provider = _LiftPlugin.getProviderClass(type);
    if (Provider === void 0) {
      throw new import_error.default(`The provider '${id}' has an unknown type '${type}'`, "LIFT_UNKNOWN_PROVIDER_TYPE");
    }
    const configuration = (0, import_lodash.get)(this.serverless.configurationInput.providers, id, {});
    return Provider.create(this.serverless, id, configuration);
  }
  loadConstructs() {
    if (this.constructs !== void 0) {
      throw new Error("Constructs are already initialized: this should not happen");
    }
    this.constructs = {};
    const constructsInputConfiguration = (0, import_lodash.get)(this.serverless.configurationInput, "constructs", {});
    for (const [id, { type, provider: providerId }] of Object.entries(constructsInputConfiguration)) {
      if (providerId === void 0) {
        this.constructs[id] = this.providers[DEFAULT_PROVIDER].createConstruct(type, id);
        continue;
      }
      const provider = this.getLiftProviderById(providerId);
      if (!provider) {
        throw new import_error.default(`No provider ${providerId} was found for construct ${id}. Available providers are ${Object.keys(this.providers).join(", ")}`, "LIFT_UNKNOWN_PROVIDER_ID");
      }
      this.constructs[id] = provider.createConstruct(type, id);
    }
  }
  getConstructs() {
    if (this.constructs === void 0) {
      throw new Error("Constructs are not initialized: this should not happen");
    }
    return this.constructs;
  }
  getLiftProviderById(id) {
    return this.providers[id];
  }
  resolveReference({ address }) {
    return {
      value: import_aws_cdk_lib.Lazy.any({
        produce: () => {
          const constructs = this.getConstructs();
          const [id, property] = address.split(".", 2);
          if (!(0, import_lodash.has)(this.constructs, id)) {
            throw new import_error.default(`No construct named '${id}' was found, the \${construct:${id}.${property}} variable is invalid.`, "LIFT_VARIABLE_UNKNOWN_CONSTRUCT");
          }
          const construct = constructs[id];
          const properties = construct.variables ? construct.variables() : {};
          if (!(0, import_lodash.has)(properties, property)) {
            if (Object.keys(properties).length === 0) {
              throw new import_error.default(`\${construct:${id}.${property}} does not exist. The construct '${id}' does not expose any property`, "LIFT_VARIABLE_UNKNOWN_PROPERTY");
            }
            throw new import_error.default(`\${construct:${id}.${property}} does not exist. Properties available on \${construct:${id}} are: ${Object.keys(properties).join(", ")}`, "LIFT_VARIABLE_UNKNOWN_PROPERTY");
          }
          return properties[property];
        }
      }).toString()
    };
  }
  async info() {
    const constructs = this.getConstructs();
    for (const [id, construct] of Object.entries(constructs)) {
      if (typeof construct.outputs !== "function") {
        continue;
      }
      const outputs = construct.outputs();
      if (Object.keys(outputs).length === 1) {
        const resolver = Object.values(outputs)[0];
        const output = await resolver();
        if (output !== void 0) {
          if (this.serverless.addServiceOutputSection) {
            this.serverless.addServiceOutputSection(id, output);
          } else {
            console.log(`${import_chalk.default.yellow(`${id}:`)} ${output}`);
          }
        }
      }
      if (Object.keys(outputs).length > 1) {
        const content = [];
        for (const [name, resolver] of Object.entries(outputs)) {
          const output = await resolver();
          if (output !== void 0) {
            content.push(`${name}: ${output}`);
          }
        }
        if (this.serverless.addServiceOutputSection) {
          this.serverless.addServiceOutputSection(id, content);
        } else {
          console.log(import_chalk.default.yellow(`${id}:`));
          console.log(content.map((line) => `  ${line}`).join(`
`));
        }
      }
    }
  }
  registerCommands() {
    const constructsConfiguration = (0, import_lodash.get)(this.serverless.configurationInput, "constructs", {});
    for (const [id, constructConfig] of Object.entries(constructsConfiguration)) {
      if (constructConfig.type === void 0) {
        throw new import_error.default(`The construct '${id}' has no 'type' defined.
Find all construct types available here: https://github.com/getlift/lift#constructs`, "LIFT_MISSING_CONSTRUCT_TYPE");
      }
      const constructClass = this.getConstructClass(constructConfig.type);
      if (constructClass === void 0) {
        throw new import_error.default(`The construct '${id}' has an unknown type '${constructConfig.type}'
Find all construct types available here: https://github.com/getlift/lift#constructs`, "LIFT_UNKNOWN_CONSTRUCT_TYPE");
      }
      if (constructClass.commands === void 0) {
        continue;
      }
      for (const [command, commandDefinition] of Object.entries(constructClass.commands)) {
        this.commands[`${id}:${command}`] = {
          lifecycleEvents: [command],
          usage: commandDefinition.usage,
          options: commandDefinition.options
        };
        this.hooks[`${id}:${command}:${command}`] = () => {
          const construct = this.getConstructs()[id];
          return commandDefinition.handler.call(construct, this.cliOptions);
        };
      }
    }
  }
  async postDeploy() {
    const constructs = this.getConstructs();
    for (const [, construct] of Object.entries(constructs)) {
      if (construct.postDeploy !== void 0) {
        await construct.postDeploy();
      }
    }
  }
  async preRemove() {
    const constructs = this.getConstructs();
    for (const [, construct] of Object.entries(constructs)) {
      if (construct.preRemove !== void 0) {
        await construct.preRemove();
      }
    }
  }
  resolveLazyVariables() {
    const tokenResolver = new import_aws_cdk_lib.DefaultTokenResolver(new import_aws_cdk_lib.StringConcat());
    const resolveTokens = (input) => {
      if (input === void 0) {
        return input;
      }
      return import_aws_cdk_lib.Tokenization.resolve(input, {
        resolver: tokenResolver,
        scope: this.providers[DEFAULT_PROVIDER].stack
      });
    };
    this.serverless.service.provider = resolveTokens(this.serverless.service.provider);
    this.serverless.service.package = resolveTokens(this.serverless.service.package);
    this.serverless.service.custom = resolveTokens(this.serverless.service.custom);
    this.serverless.service.resources = resolveTokens(this.serverless.service.resources);
    this.serverless.service.functions = resolveTokens(this.serverless.service.functions);
    this.serverless.service.layers = resolveTokens(this.serverless.service.layers);
    this.serverless.service.outputs = resolveTokens(this.serverless.service.outputs);
    this.serverless.configurationInput = resolveTokens(this.serverless.configurationInput);
  }
  appendCloudformationResources() {
    this.providers[DEFAULT_PROVIDER].appendCloudformationResources();
  }
  appendPermissions() {
    var _a, _b, _c;
    const liftConfiguration = (0, import_lodash.get)(this.serverless.configurationInput, "lift", {});
    if (liftConfiguration.automaticPermissions === false) {
      return;
    }
    const constructs = this.getConstructs();
    const statements = (0, import_lodash.flatten)(Object.entries(constructs).map(([, construct]) => {
      return construct.permissions ? construct.permissions() : [];
    }));
    if (statements.length === 0) {
      return;
    }
    const role = (_a = this.serverless.service.provider.iam) == null ? void 0 : _a.role;
    if (typeof role === "object" && "statements" in role) {
      (_b = role.statements) == null ? void 0 : _b.push(...statements);
      return;
    }
    this.serverless.service.provider.iamRoleStatements = (_c = this.serverless.service.provider.iamRoleStatements) != null ? _c : [];
    this.serverless.service.provider.iamRoleStatements.push(...statements);
  }
  async eject() {
    (0, import_logger.getUtils)().log("Ejecting from Lift to CloudFormation");
    (0, import_logger.getUtils)().log();
    await this.serverless.pluginManager.spawn("package");
    const legacyProvider = this.serverless.getProvider("aws");
    const compiledTemplateFileName = legacyProvider.naming.getCompiledTemplateFileName();
    const compiledTemplateFilePath = path.join(this.serverless.serviceDir, ".serverless", compiledTemplateFileName);
    const cfTemplate = (0, import_fs.readFileSync)(compiledTemplateFilePath);
    const formattedYaml = (0, import_js_yaml.dump)(JSON.parse(cfTemplate.toString()));
    (0, import_logger.getUtils)().writeText(formattedYaml);
    (0, import_logger.getUtils)().log("You can also find that CloudFormation template in the following file:");
    (0, import_logger.getUtils)().log(compiledTemplateFilePath);
  }
  getAllConstructClasses() {
    const result = (0, import_lodash.flatten)(_LiftPlugin.getAllProviderClasses().map((providerClass) => providerClass.getAllConstructClasses()));
    return result;
  }
  getConstructClass(constructType) {
    for (const providerClass of _LiftPlugin.getAllProviderClasses()) {
      const constructClass = providerClass.getConstructClass(constructType);
      if (constructClass !== void 0) {
        return constructClass;
      }
    }
    return void 0;
  }
};
let LiftPlugin = _LiftPlugin;
LiftPlugin.providerClasses = {};
LiftPlugin.registerProviders(import_providers.AwsProvider, import_providers.StripeProvider);
module.exports = LiftPlugin;
//# sourceMappingURL=plugin.js.map
