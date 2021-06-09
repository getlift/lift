import chalk from "chalk";

export function log(message: string): void {
    console.log("Lift: " + chalk.yellow(message));
}

export function debug(message: string): void {
    if (process.env.SLS_DEBUG !== undefined) {
        console.log(chalk.gray("Lift: " + message));
    }
}
