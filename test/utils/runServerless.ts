import path from "path";
import { ConstructNode, Names } from "@aws-cdk/core";
import type originalRunServerless from "@serverless/test/run-serverless";
import setupRunServerlessFixturesEngine from "@serverless/test/setup-run-serverless-fixtures-engine";

type ComputeLogicalId = (...address: string[]) => string;

type RunServerlessPromiseReturn = ReturnType<typeof originalRunServerless>;
type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
type RunServerlessReturn = ThenArg<RunServerlessPromiseReturn>;

const computeLogicalId = (serverless: Record<string, unknown>, ...address: string[]): string => {
    // @ts-expect-error Comes from the stack being declared by plugin.ts. Serverless context object definition shall be improved.
    const initialNode = serverless.stack.node as ConstructNode;
    const foundNode = [...address].reduce((currentNode, nextNodeId) => {
        const nextNode = currentNode.tryFindChild(nextNodeId);
        if (!nextNode) {
            throw new Error(`No node named ${nextNodeId} found in ${address.join(".")} address.`);
        }

        return nextNode.node;
    }, initialNode);

    // Some CDK constructs have a sub-node called `Resource`, some others don't
    const resourceNode = foundNode.tryFindChild("Resource");
    if (resourceNode) {
        return Names.nodeUniqueId(resourceNode.node);
    }

    return Names.nodeUniqueId(foundNode);
};

export const runServerless = async (
    options: Parameters<typeof originalRunServerless>[0]
): Promise<RunServerlessReturn & { computeLogicalId: ComputeLogicalId }> => {
    const runServerlessReturnValues = await setupRunServerlessFixturesEngine({
        fixturesDir: path.resolve(__dirname, "../fixtures"),
        serverlessDir: path.resolve(__dirname, "../../node_modules/serverless"),
    })(options);

    return {
        ...runServerlessReturnValues,
        computeLogicalId: (...address: string[]) => computeLogicalId(runServerlessReturnValues.serverless, ...address),
    };
};

export const pluginConfigExt = {
    plugins: [path.join(process.cwd(), "src/plugin.ts")],
};
