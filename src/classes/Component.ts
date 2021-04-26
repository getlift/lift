import type { FromSchema, JSONSchema } from "json-schema-to-ts";
import { AwsIamPolicyStatements } from "@serverless/typescript";
import type { Hook, Serverless } from "../types/serverless";
import { PolicyStatement } from "../Stack";

export abstract class Component<N extends string, S extends JSONSchema> {
    protected readonly name: N;
    protected hooks: Record<string, Hook>;
    protected commands: Record<string, { lifecycleEvents: string[] }> = {};
    protected serverless: Serverless;

    getConfiguration(): FromSchema<S> | undefined {
        return ((this.serverless.configurationInput as unknown) as Record<
            N,
            FromSchema<S>
        >)[this.name];
    }

    getName(): N {
        return this.name;
    }

    protected constructor({
        serverless,
        name,
        schema,
    }: {
        serverless: Serverless;
        name: N;
        schema: S;
    }) {
        this.name = name;
        this.serverless = serverless;

        this.serverless.configSchemaHandler.defineTopLevelProperty(
            this.name,
            schema
        );

        this.hooks = {
            initialize: this.appendPermissions.bind(this),
            "package:compileEvents": this.compile.bind(this),
        };
    }

    abstract compile(): void | Promise<void>;

    appendPermissions(): void {
        const statements = (this.permissions() as unknown) as AwsIamPolicyStatements;
        if (statements.length === 0) {
            return;
        }
        this.serverless.service.provider.iamRoleStatements =
            this.serverless.service.provider.iamRoleStatements ?? [];
        this.serverless.service.provider.iamRoleStatements.push(...statements);
    }

    permissions(): PolicyStatement[] {
        return [];
    }

    protected getRegion(): string {
        return this.serverless.getProvider("aws").getRegion();
    }

    protected getStackName(): string {
        return this.serverless.getProvider("aws").naming.getStackName();
    }
}
