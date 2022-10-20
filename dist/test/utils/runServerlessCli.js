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
  runServerlessCli: () => runServerlessCli
});
var import_child_process = __toModule(require("child_process"));
var import_fs = __toModule(require("fs"));
var path = __toModule(require("path"));
async function runServerlessCli({ command, fixture }) {
  return new Promise((resolve, reject) => {
    const serverlessCmd = path.join(__dirname, "../../node_modules/.bin/serverless");
    const process = (0, import_child_process.spawn)(`${serverlessCmd} ${command}`, {
      shell: true,
      cwd: path.join(__dirname, "../fixtures", fixture)
    });
    let output = "";
    process.stdout.on("data", (data) => output += data);
    process.stderr.on("data", (data) => output += data);
    process.on("data", (data) => resolve(data));
    process.on("error", (err) => reject(new Error(`Exit code: ${err.message}
` + output)));
    process.on("close", (err) => {
      if (err === 0) {
        const json = (0, import_fs.readFileSync)(__dirname + "/../fixtures/variables/.serverless/cloudformation-template-update-stack.json");
        resolve({
          stdoutData: output,
          cfTemplate: JSON.parse(json.toString())
        });
      } else {
        reject(new Error(`Exit code: ${err}
` + output));
      }
    });
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runServerlessCli
});
//# sourceMappingURL=runServerlessCli.js.map
