import {stdout} from 'stdout-stderr';
import {loadConfig} from '@oclif/test/lib/load-config';
import {spawn} from 'child_process';

export async function runCommand(workingDir: string, command: string, args: string[] = []): Promise<string> {
    // Mock stdout
    stdout.print = true;
    stdout.start();
    try {
        const oclif = await loadConfig({
            root: __dirname + '/../..',
        }).run({} as any)
        await oclif.runHook('init', {id: command, argv: args})
        process.chdir(workingDir);
        await oclif.runCommand(command, args)
    } finally {
        stdout.stop();
    }
    return stdout.output;
}

export async function execute(command: string, workingDirectory: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
        const process = spawn(command, {
            shell: true,
            cwd: workingDirectory,
        });
        let output = '';
        process.stdout.on('data', data => output += data);
        process.stderr.on('data', data => output += data);
        process.on('data', data => resolve(data));
        process.on('error', err => reject(new Error(`Exit code: ${err}\n` + output)));
        process.on('close', err => {
            if (err === 0) {
                resolve(output);
            } else {
                reject(new Error(`Exit code: ${err}\n` + output));
            }
        });
    });
}
