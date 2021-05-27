export interface Construct {
    outputs(): Record<string, () => Promise<string | undefined>>;

    commands(): Record<string, () => Promise<void>>;

    // TODO will eventually be removed
    references(): Record<string, () => Record<string, unknown>>;
}
