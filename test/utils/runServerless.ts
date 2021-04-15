import path from "path";
import setupRunServerlessFixturesEngine from "@serverless/test/setup-run-serverless-fixtures-engine";

export const runServerless = setupRunServerlessFixturesEngine({
    fixturesDir: path.resolve(__dirname, "../fixtures"),
    serverlessDir: path.resolve(__dirname, "../../node_modules/serverless"),
});

export const pluginConfigExt = {
    plugins: [path.join(process.cwd(), "src/plugin.ts")],
};
