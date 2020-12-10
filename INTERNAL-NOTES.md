## CloudFormation exports and imports

It is possible to use output `Export` and `Fn::ImportValue` to reference outputs of a stack from another one.

E.g. to make the DB name available as an environment variable in Lambda.

But once an output is "used" (via `Fn::ImportValue`) by another stack, it cannot be changed. So that destroys the value of using cross-stack references.

The chosen alternative was to fetch the stack output values (the real values) and inject them in serverless.yml (no references).
