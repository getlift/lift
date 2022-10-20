import type originalRunServerless from "@serverless/test/run-serverless";
import type { AWS } from "@serverless/typescript";
import type { Serverless } from "../../src/types/serverless";
declare type ComputeLogicalId = (...address: string[]) => string;
declare type RunServerlessPromiseReturn = ReturnType<typeof originalRunServerless>;
declare type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
declare type RunServerlessReturn = ThenArg<RunServerlessPromiseReturn>;
declare const computeLogicalId: (serverless: Serverless, ...address: string[]) => string;
export declare const runServerless: (options: Parameters<typeof originalRunServerless>[0]) => Promise<RunServerlessReturn & {
    computeLogicalId: ComputeLogicalId;
}>;
export declare const pluginConfigExt: {
    plugins: string[];
};
export declare const baseConfig: AWS;
export {};
