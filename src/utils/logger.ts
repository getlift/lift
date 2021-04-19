import chalk from "chalk";

export function log(message: string): void {
    console.log("Lift: " + chalk.yellow(message));
}
