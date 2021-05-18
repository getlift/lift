import { FromSchema, JSONSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";

export abstract class Component<S extends JSONSchema> {
    public readonly schema: S;
    protected readonly id: string;
    protected readonly serverless: Serverless;
    protected readonly configuration: FromSchema<S>;

    protected constructor(serverless: Serverless, id: string, schema: S, configuration: FromSchema<S>) {
        this.id = id;
        this.serverless = serverless;
        this.schema = schema;
        this.configuration = configuration;
    }

    abstract deploy(): Promise<void>;

    abstract remove(): Promise<void>;

    commands(): Record<string, () => Promise<void>> {
        return {};
    }

    public abstract variables(): Record<string, () => Promise<string | undefined>>;

    /**
     * Output for `serverless info`
     */
    abstract infoOutput(): Promise<string | undefined>;
}
