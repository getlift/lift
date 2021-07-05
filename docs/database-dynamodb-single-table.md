# Database - DynamoDB Single Table

The `database/dynamodb-single-table` construct deploys a single DynamoDB table with pre-configured indexes following [Single Table Design](https://www.alexdebrie.com/posts/dynamodb-single-table/) principles.

## Quick start

```yaml
service: my-app
provider:
  name: aws

constructs:
    myTable:
        type: database/dynamodb-single-table

plugins:
    - serverless-lift
```

On `serverless deploy`, a preconfigured DynamoDB table will be created.

## How it works

The `database/dynamodb-single-table` construct creates and configures the table for production:

- a composite primary index with generic attributes names - `PK` for the partition key and `SK` for the sort key
- 5 local secondary indexes, the maximum allowed, with generic names - `LSI-1` to `LSI-5` for the index names and `LSI-1-SK` to `LSI-5-SK` for the sort keys. Those indexes have no impact on pricing as long as their indexes are not populated with data. Modifying a table local secondary indexes configuration requires table re-creation, thus enabling all of them by default at table creation.
- a configurable amount of up to 20 glocal secondary indexes with generic names - `GSI-1` to `GSI-20` for the index names, `GSI-1-PK` to `GSI-20-PK` for the partition keys and `GSI-1-SK` to `GSI-20-SK` for the sort keys
- all indexes attributes have string data type, ideal for composite attribue - i.e. `value1#value2`
- a DynamoDB stream publishing new and old values at each write operation on the table

## Variables

All database constructs expose the following variables:

- `tableName`: the name of the deployed DynamoDB table
- `tableStreamArn`: the ARN of the stream of the deployed DynamoDB table

This can be used to inject the tableName to a Lambda functions using the SDK to read or write data from the table, for example:

```yaml
constructs:
    myTable:
        type: database/dynamodb-single-table

functions:
    myFunction:
        handler: src/index.handler
        environment:
            TABLE_NAME: ${construct:myTable.tableName}
```

_How it works: the `${construct:myTable.tableName}` variable will automatically be replaced with a CloudFormation reference to the DynamoDB table._

## Permissions

By default, all the Lambda functions deployed in the same `serverless.yml` file **will be allowed to read/write into the table**.

In the example below, there are no IAM permissions to set up: `myFunction` will be allowed to read and write into the `myTable` table.

```yaml
constructs:
    myTable:
        type: database/dynamodb-single-table

functions:
    myFunction:
        handler: src/index.handler
        environment:
            TABLE_NAME: ${construct:myTable.tableName}
```

## Configuration reference

### Global secondary indexes

Global secondary indexes have a direct impact on the cost of a DynamoDB table. There is no GSI configured by default on the database construct.

You can specify the amount of GSI you'd like to enable on a DynamoDB table using the `gsiQuantity` property.

```yaml
constructs:
    myTable:
        # ...
        gsiQuantity: 3
```

The first time you deploy your construct using `serverless deploy`, you can specify any amount of GSI between `1` and `20`. On subsequent deploys, any modification made to an already deployed construct cannot add or remove more than 1 GSI at a time. If you need 2 additional GSI after initial deployment of the exemple above, you must first update the `gsiQuantity` to `4`, deploy, and then finally update it to the final desired quantity of `5`.

### More options

Looking for more options in the construct configuration? [Open a GitHub issue](https://github.com/getlift/lift/issues/new).
