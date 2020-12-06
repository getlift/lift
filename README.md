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
lift/0.0.1 darwin-x64 node-v15.3.0
$ lift --help [COMMAND]
USAGE
  $ lift COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`lift export`](#lift-export)
* [`lift help [COMMAND]`](#lift-help-command)
* [`lift permissions`](#lift-permissions)
* [`lift remove`](#lift-remove)
* [`lift status`](#lift-status)
* [`lift up`](#lift-up)
* [`lift variables`](#lift-variables)

## `lift export`

export the stack to a YAML CloudFormation template

```
USAGE
  $ lift export

EXAMPLE
  $ lift export
  AWSTemplateFormatVersion: '2010-09-09'
  ...
```

_See code: [src/commands/export.ts](https://github.com/mnapoli/lift/blob/v0.0.1/src/commands/export.ts)_

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

## `lift permissions`

export the IAM permissions

```
USAGE
  $ lift permissions
```

_See code: [src/commands/permissions.ts](https://github.com/mnapoli/lift/blob/v0.0.1/src/commands/permissions.ts)_

## `lift remove`

delete the deployed stack

```
USAGE
  $ lift remove

OPTIONS
  -f, --force  force the deletion

EXAMPLE
  $ lift delete
  Stack deleted.
```

_See code: [src/commands/remove.ts](https://github.com/mnapoli/lift/blob/v0.0.1/src/commands/remove.ts)_

## `lift status`

Status of the stack

```
USAGE
  $ lift status

EXAMPLE
  $ lift status
```

_See code: [src/commands/status.ts](https://github.com/mnapoli/lift/blob/v0.0.1/src/commands/status.ts)_

## `lift up`

deploy the stack

```
USAGE
  $ lift up
```

_See code: [src/commands/up.ts](https://github.com/mnapoli/lift/blob/v0.0.1/src/commands/up.ts)_

## `lift variables`

export the environment variables

```
USAGE
  $ lift variables
```

_See code: [src/commands/variables.ts](https://github.com/mnapoli/lift/blob/v0.0.1/src/commands/variables.ts)_
<!-- commandsstop -->
