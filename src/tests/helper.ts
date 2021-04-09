import { spawn } from "child_process";

export async function execute(
    command: string,
    workingDirectory: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const process = spawn(command, {
            shell: true,
            cwd: workingDirectory,
        });
        let output = "";
        process.stdout.on("data", (data) => (output += data));
        process.stderr.on("data", (data) => (output += data));
        process.on("data", (data) => resolve(data));
        process.on("error", (err) =>
            reject(new Error(`Exit code: ${err.message}\n` + output))
        );
        process.on("close", (err) => {
            if (err === 0) {
                resolve(output);
            } else {
                reject(new Error(`Exit code: ${err}\n` + output));
            }
        });
    });
}
