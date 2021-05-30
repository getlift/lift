export default interface Construct {
    outputs(): Record<string, () => Promise<string | undefined>>;

    commands(): Record<string, () => void | Promise<void>>;

    /**
     * CDK references
     * TODO will eventually be removed
     */
    references(): Record<string, string>;
}
