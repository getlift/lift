import chalk from 'chalk';

let loggingEnabled = false;

export function enableServerlessLogs() {
    loggingEnabled = true;
}

export function logServerless(message: string) {
    if (loggingEnabled) {
        console.log('Lift: ' + chalk.yellow(message));
    }
}
