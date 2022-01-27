import chalk from "chalk";

type Logger = ((message?: string) => void) & {
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

export type ServerlessUtils = {
    writeText(message?: string | string[]): void;
    log: Logger;
    progress?: {
        create(opts?: { message: string }): Progress;
    };
};

let utils: ServerlessUtils | undefined;

function createLegacyUtils(): ServerlessUtils {
    const logger = (message?: string | string[]) => {
        if (Array.isArray(message)) {
            message = message.join("\n");
        }
        console.log("Lift: " + chalk.yellow(message));
    };
    logger.debug = (message?: string | string[]) => {
        if (process.env.SLS_DEBUG !== undefined) {
            if (Array.isArray(message)) {
                message = message.join("\n");
            }
            console.log(chalk.gray("Lift: " + (message ?? "")));
        }
    };
    logger.verbose = logger.debug;
    logger.success = logger;
    logger.warning = logger;
    logger.error = logger;
    logger.get = () => logger;

    return {
        writeText: logger,
        log: logger,
    };
}

export function setUtils(u: ServerlessUtils | undefined): void {
    utils = u;
}

export function getUtils(): ServerlessUtils {
    if (utils === undefined) {
        utils = createLegacyUtils();
    }

    return utils;
}
