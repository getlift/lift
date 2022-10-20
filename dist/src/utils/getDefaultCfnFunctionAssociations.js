var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
__export(exports, {
  getCfnFunctionAssociations: () => getCfnFunctionAssociations
});
function cdkFunctionAssociationToCfnFunctionAssociation({
  eventType,
  functionArn
}) {
  if (eventType === void 0 || functionArn === void 0) {
    throw new Error("eventType and functionArn must be defined");
  }
  return {
    EventType: eventType,
    FunctionARN: functionArn
  };
}
function getCfnFunctionAssociations(distribution) {
  const defaultBehavior = distribution.distributionConfig.defaultCacheBehavior;
  return defaultBehavior.functionAssociations.map(cdkFunctionAssociationToCfnFunctionAssociation);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getCfnFunctionAssociations
});
//# sourceMappingURL=getDefaultCfnFunctionAssociations.js.map
