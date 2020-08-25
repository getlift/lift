lift
====



[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/lift.svg)](https://npmjs.org/package/lift)
[![Downloads/week](https://img.shields.io/npm/dw/lift.svg)](https://npmjs.org/package/lift)
[![License](https://img.shields.io/npm/l/lift.svg)](https://github.com/mnapoli/lift/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g lift
$ lift COMMAND
running command...
$ lift (-v|--version|version)
lift/0.0.0 darwin-x64 node-v14.7.0
$ lift --help [COMMAND]
USAGE
  $ lift COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`lift hello [FILE]`](#lift-hello-file)
* [`lift help [COMMAND]`](#lift-help-command)

## `lift hello [FILE]`

describe the command here

```
USAGE
  $ lift hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ lift hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/mnapoli/lift/blob/v0.0.0/src/commands/hello.ts)_

## `lift help [COMMAND]`

display help for lift

```
USAGE
  $ lift help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.0/src/commands/help.ts)_
<!-- commandsstop -->
