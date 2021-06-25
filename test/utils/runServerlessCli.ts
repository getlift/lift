import { spawn } from "child_process";
import { readFileSync } from "fs";
import * as path from "path";

export async function runServerlessCli({ command, fixture }: RunServerlessCliOptions): Promise<RunServerlessCliReturn> {
    return new Promise((resolve, reject) => {
        const serverlessCmd = path.join(__dirname, "../../node_modules/.bin/serverless");
        const process = spawn(`${serverlessCmd} ${command}`, {
            shell: true,
            cwd: path.join(__dirname, "../fixtures", fixture),
        });
        let output = "";
        process.stdout.on("data", (data) => (output += data));
        process.stderr.on("data", (data) => (output += data));
        process.on("data", (data) => resolve(data));
        process.on("error", (err) => reject(new Error(`Exit code: ${err.message}\n` + output)));
        process.on("close", (err) => {
            if (err === 0) {
                const json = readFileSync(
                    __dirname + "/../fixtures/variables/.serverless/cloudformation-template-update-stack.json"
                );
                resolve({
                    stdoutData: output,
                    cfTemplate: JSON.parse(json.toString()) as {
                        Resources: Record<string, unknown>;
                        Outputs: Record<string, unknown>;
                    },
                });
            } else {
                reject(new Error(`Exit code: ${err}\n` + output));
            }
        });
    });
}

type RunServerlessCliOptions = {
    fixture: string;
    command: string;
};

type RunServerlessCliReturn = {
    stdoutData: string;
    cfTemplate: {
        Resources: Record<string, unknown>;
        Outputs: Record<string, unknown>;
    };
};
