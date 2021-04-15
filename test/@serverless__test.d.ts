declare module "@serverless/test/run-serverless" {
    import type { AWS } from "@serverless/typescript";

    type RunServerlessBaseOptions = Partial<{
        cliArgs: string[];
        configExt: Partial<AWS>;
        env: Record<string, string>;
        awsRequestStubMap: unknwon;
    }>;

    type RunServerlessCWDOption = {
        cwd: string;
    };
    type RunServerlessConfigOption = {
        config: AWS;
    };
    type RunServerlessNoServiceOption = {
        noService: boolean;
    };

    type RunServerlessOptions = RunServerlessBaseOptions &
        (
            | RunServerlessCWDOption
            | RunServerlessConfigOption
            | RunServerlessNoServiceOption
        );

    type RunServerlessReturn = {
        serverless: Record<string, unknown>;
        stdoutData: string;
        cfTemplate: {
            Resources: Record<string, unknown>;
        };
        awsNaming: unknown;
    };

    function runServerless(
        serverlessDir: string,
        options: RunServerlessOptions
    ): Promise<RunServerlessReturn>;

    export = runServerless;
}
