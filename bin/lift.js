#!/usr/bin/env node

require("@oclif/command")
    .run()
    .then(require("@oclif/command/flush"))
    .catch((err) => {
        const oclifHandler = require("@oclif/errors/handle");
        const chalk = require("chalk");
        console.error(chalk.red("Error:"));

        // Show errors with stack traces
        try {
            const clean = require("clean-stack");
            console.error(clean(err.stack || err, { pretty: true }));
        } catch (e) {
            console.error(e);
        }

        return oclifHandler(err);
    });
