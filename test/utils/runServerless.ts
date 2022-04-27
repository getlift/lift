import path from "path";
import { Names } from "aws-cdk-lib";
import type originalRunServerless from "@serverless/test/run-serverless";
import setupRunServerlessFixturesEngine from "@serverless/test/setup-run-serverless-fixtures-engine";
import type { AWS } from "@serverless/typescript";
import type { Serverless } from "../../src/types/serverless";

type ComputeLogicalId = (...address: string[]) => string;

type RunServerlessPromiseReturn = ReturnType<typeof originalRunServerless>;
type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
type RunServerlessReturn = ThenArg<RunServerlessPromiseReturn>;

const computeLogicalId = (serverless: Serverless, ...address: string[]): string => {
    const initialNode = serverless.stack.node;
    const foundNode = [...address].reduce((currentNode, nextNodeId) => {
        const nextNode = currentNode.tryFindChild(nextNodeId);
        if (!nextNode) {
            const existingNodes = currentNode.children.map((child) => child.node.id).join(", ");
            throw new Error(
                `No node named ${nextNodeId} found in ${address.join(".")} address. Existing nodes: ${existingNodes}`
            );
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
        computeLogicalId: (...address: string[]) =>
            computeLogicalId(runServerlessReturnValues.serverless as Serverless, ...address),
    };
};

export const pluginConfigExt = {
    plugins: [path.join(process.cwd(), "src/plugin.ts")],
};

export const baseConfig: AWS = {
    service: "app",
    provider: {
        name: "aws",
    },
    plugins: [path.join(process.cwd(), "src/plugin.ts")],
};
