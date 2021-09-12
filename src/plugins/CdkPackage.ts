import type { AwsProvider } from "@lift/providers";
import * as path from "path";
import * as fs from "fs";
import type { Serverless } from "../types/serverless";
import type { Hook } from "../types/serverless";

export class CdkPackage {
    private readonly provider: AwsProvider;
    public readonly hooks: Record<string, Hook>;

    constructor(private readonly serverless: Serverless) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.provider = serverless.getProvider("aws-cdk") as unknown as AwsProvider;

        this.hooks = {
            "after:package:finalize": this.package.bind(this),
        };
    }

    package(): void {
        const stack = this.provider.stack;

        console.log(`Packaging ${stack.stackName}`);
        const stackArtifact = this.provider.app.synth().getStackByName(stack.stackName);
        const templatePath = path.join(process.cwd(), ".serverless/cdk-template.json");
        fs.writeFileSync(templatePath, JSON.stringify(stackArtifact.template, undefined, 2));
    }
}
