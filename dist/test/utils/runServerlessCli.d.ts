export declare function runServerlessCli({ command, fixture }: RunServerlessCliOptions): Promise<RunServerlessCliReturn>;
declare type RunServerlessCliOptions = {
    fixture: string;
    command: string;
};
declare type RunServerlessCliReturn = {
    stdoutData: string;
    cfTemplate: {
        Resources: Record<string, unknown>;
        Outputs: Record<string, unknown>;
    };
};
export {};
