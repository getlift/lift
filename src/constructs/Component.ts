import { FromSchema, JSONSchema } from "json-schema-to-ts";
import { Provider } from "./Provider";

export abstract class Component<S extends JSONSchema> {
    protected readonly id: string;
    protected readonly provider: Provider<Component<any>>;
    protected readonly configuration: FromSchema<S>;

    protected constructor(provider: Provider<Component<any>>, id: string, configuration: FromSchema<S>) {
        this.id = id;
        this.provider = provider;
        this.configuration = configuration;
    }

    public abstract outputs(): Record<string, () => Promise<string | undefined>>;

    commands(): Record<string, () => Promise<void>> {
        return {};
    }

    /**
     * TODO will eventually be removed
     */
    public abstract references(): Record<string, () => Record<string, unknown>>;
}
