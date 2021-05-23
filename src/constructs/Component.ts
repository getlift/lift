import { FromSchema, JSONSchema } from "json-schema-to-ts";
import type { Serverless } from "../types/serverless";
import { PolicyStatement } from "../Stack";
import { Provider } from "./Provider";

export abstract class Component<S extends JSONSchema> {
    protected readonly id: string;
    protected readonly serverless: Serverless;
    protected readonly configuration: FromSchema<S>;
    protected readonly provider: Provider<Component<any>>;

    protected constructor(
        serverless: Serverless,
        provider: Provider<Component<any>>,
        id: string,
        configuration: FromSchema<S>
    ) {
        this.id = id;
        this.provider = provider;
        this.serverless = serverless;
        this.configuration = configuration;
    }

    public abstract exposedVariables(): Record<string, () => Record<string, unknown>>;

    commands(): Record<string, () => Promise<void>> {
        return {};
    }

    permissions(): PolicyStatement[] {
        return [];
    }

    /**
     * Output for `serverless info`
     */
    abstract infoOutput(): Promise<string | undefined>;
}
