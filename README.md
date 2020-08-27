shift
=====



[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/shift.svg)](https://npmjs.org/package/shift)
[![Downloads/week](https://img.shields.io/npm/dw/shift.svg)](https://npmjs.org/package/shift)
[![License](https://img.shields.io/npm/l/shift.svg)](https://github.com/mnapoli/shift/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g shift
$ shift COMMAND
running command...
$ shift (-v|--version|version)
shift/0.0.0 darwin-x64 node-v14.7.0
$ shift --help [COMMAND]
USAGE
  $ shift COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`shift export`](#shift-export)
* [`shift help [COMMAND]`](#shift-help-command)
* [`shift permissions`](#shift-permissions)
* [`shift remove`](#shift-remove)
* [`shift status`](#shift-status)
* [`shift up`](#shift-up)
* [`shift variables`](#shift-variables)

## `shift export`

export the stack to a YAML CloudFormation template

```
USAGE
  $ shift export

EXAMPLE
  $ shift export
  AWSTemplateFormatVersion: '2010-09-09'
  ...
```

_See code: [src/commands/export.ts](https://github.com/mnapoli/shift/blob/v0.0.0/src/commands/export.ts)_

## `shift help [COMMAND]`

display help for shift

```
USAGE
  $ shift help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.0/src/commands/help.ts)_

## `shift permissions`

export the IAM permissions

```
USAGE
  $ shift permissions
```

_See code: [src/commands/permissions.ts](https://github.com/mnapoli/shift/blob/v0.0.0/src/commands/permissions.ts)_

## `shift remove`

delete the deployed stack

```
USAGE
  $ shift remove

OPTIONS
  -f, --force  force the deletion

EXAMPLE
  $ shift delete
  Stack deleted.
```

_See code: [src/commands/remove.ts](https://github.com/mnapoli/shift/blob/v0.0.0/src/commands/remove.ts)_

## `shift status`

Status of the stack

```
USAGE
  $ shift status

EXAMPLE
  $ shift status
```

_See code: [src/commands/status.ts](https://github.com/mnapoli/shift/blob/v0.0.0/src/commands/status.ts)_

## `shift up`

deploy the stack

```
USAGE
  $ shift up
```

_See code: [src/commands/up.ts](https://github.com/mnapoli/shift/blob/v0.0.0/src/commands/up.ts)_

## `shift variables`

export the environment variables

```
USAGE
  $ shift variables
```

_See code: [src/commands/variables.ts](https://github.com/mnapoli/shift/blob/v0.0.0/src/commands/variables.ts)_
<!-- commandsstop -->
