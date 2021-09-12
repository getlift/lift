import type { AwsProvider } from "@lift/providers";
import chalk from "chalk";
import type { Serverless } from "../types/serverless";
import type { Hook } from "../types/serverless";
import type { CommandsDefinition } from "../types/serverless";

export class CdkInfo {
    private readonly provider: AwsProvider;
    public readonly hooks: Record<string, Hook>;
    public readonly commands: CommandsDefinition = {};

    constructor(private readonly serverless: Serverless) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.provider = serverless.getProvider("aws-cdk") as unknown as AwsProvider;

        this.hooks = {
            "info:info": this.info.bind(this),
        };
    }

    async info(): Promise<void> {
        for (const [id, construct] of Object.entries(this.provider.constructs)) {
            if (typeof construct.outputs !== "function") {
                continue;
            }
            const outputs = construct.outputs();
            if (Object.keys(outputs).length > 0) {
                console.log(chalk.gray(`${id}:`));
                for (const [name, resolver] of Object.entries(outputs)) {
                    const output = await resolver();
                    if (output !== undefined) {
                        console.log(`  ${name}: ${output}`);
                    }
                }
            }
        }
    }
}
