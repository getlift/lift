declare type Logger = ((message?: string) => void) & {
    debug(message: string): void;
    verbose(message: string): void;
    success(message: string): void;
    warning(message: string): void;
    error(message: string): void;
    get(namespace: string): Logger;
};
export interface Progress {
    update(message?: string): void;
    remove(): void;
}
export declare type ServerlessUtils = {
    writeText(message?: string | string[]): void;
    log: Logger;
    progress?: {
        create(opts?: {
            message: string;
        }): Progress;
    };
};
export declare function setUtils(u: ServerlessUtils | undefined): void;
export declare function getUtils(): ServerlessUtils;
export {};
