import chalk from "chalk";

let loggingEnabled = false;

export function enableServerlessLogs(): void {
    loggingEnabled = true;
}

export function logServerless(message: string): void {
    if (loggingEnabled) {
        console.log("Lift: " + chalk.yellow(message));
    }
}
