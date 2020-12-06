#!/usr/bin/env node

import '../src/commands/export';
import '../src/commands/permissions';
import '../src/commands/remove';
import '../src/commands/status';
import '../src/commands/up';
import '../src/commands/variables';

require('@oclif/command').run()
.then(require('@oclif/command/flush'))
    .catch((err: any) => {
        const oclifHandler = require('@oclif/errors/handle');

        // Show errors with stack traces
        // try {
        //     const clean = require("clean-stack");
        //     console.error(clean(err.stack || '', { pretty: true }));
        // } catch (e) {
        //     console.error(e);
        // }

        return oclifHandler(err);
    })
