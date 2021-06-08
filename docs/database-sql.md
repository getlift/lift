# Database - SQL with RDS

The `database/sql` construct deploys a properly configured **MySQL/PostgreSQL/MariaDB database** using RDS.

This construct will also automatically deploy a properly configured VPC, and run Lambda functions inside the VPC so that they can access the database.

## Quick start

```bash
serverless plugin install -n serverless-lift
```

```yaml
service: my-app
provider:
    name: aws

constructs:
    db:
        type: database/sql
        password: my-db-password

plugins:
    - serverless-lift
```

## How it works

The `database/sql` construct deploys the following resources:

- An RDS database instance.
- A VPC with public and private subnets, as well as a NAT Gateway.

The `database/sql` construct does not deploy a DB cluster: it deploys a single database instance.

## Example

Let's deploy a database and let's access it from Lambda:

```yaml
service: my-app
provider:
    name: aws

constructs:
    products:
        type: database/sql
        name: products
        password: ${ssm:/my-app/db/password}

functions:
    hello:
        handler: index.handler
        environment:
            DB_HOST: ${construct:products.host}
            DB_USER: ${construct:products.username}
            DB_PASSWORD: ${ssm:/my-app/db/password}

plugins:
    - serverless-lift
```

The example above assumes the database password was stored in SSM under the `/my-app/db/password` key.

Our `hello` function can connect to MySQL:

```js
const mysql = require('serverless-mysql')({
    config: {
        host: process.env.DB_HOST,
        database: 'products',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    }
});

exports.handler = async function(event, context) {
    const results = await mysql.query('SELECT * FROM product_items');
    // Run clean up function
    await mysql.end();
    // Return the results
    return results;
}
```

## Variables

All `database/sql` constructs expose the following variables:

- `host`: the host name of the database instance
- `port`: the port of the database instance
- `username`: the master username
- `passwordSecret`: the name of the Secrets Manager secret name (when using Secrets Manager)

These can be used to reference the database from Lambda, for example:

```yaml
constructs:
    db:
        type: database/sql

functions:
    myfunction:
        # ...
        environment:
            DB_HOST: ${construct:db.host}
```

_How it works: the `${construct:db.queueUrl}` variable will automatically be replaced with a CloudFormation reference to the database._

## Permissions

By default, all the Lambda functions deployed in the same `serverless.yml` file **will be allowed to read/write the database**.

Indeed, the VPC is configured is done so that the database is accessible from Lambda.

The database is not accessible publicly, and it is not accessible by other resources in the same AWS account.

## Configuration reference

### Engine

```yaml
constructs:
    db:
        type: database/sql
        # mysql, mariadb, or postgres
        engine: postgres
```

*Default: `mysql`.*

The `engine` option allows to choose whether to deploy a MySQL, MariaDB or PostgreSQL instance.

Here is the version deployed for each engine:

- MySQL: 8.0
- MariaDB: 10.5
- PostgreSQL: 13

### Username

```yaml
constructs:
    db:
        type: database/sql
        username: admin-username
```

*Default: `admin`.*

The `username` option controls the [master username](https://docs.aws.amazon.com/fr_fr/AWSCloudFormation/latest/UserGuide/aws-properties-rds-database-instance.html#cfn-rds-dbinstance-masterusername).

### Password

```yaml
constructs:
    db:
        # ...
        password: super-secret-password
```

The `password` option controls the [master user password](https://docs.aws.amazon.com/fr_fr/AWSCloudFormation/latest/UserGuide/aws-properties-rds-database-instance.html#cfn-rds-dbinstance-masteruserpassword).

It can be stored in SSM parameter to avoid including it in `serverless.yml`:

```yaml
constructs:
    db:
        # ...
        password: ${ssm:/my-app/db/password}

functions:
    hello:
        # ...
        environment:
            DB_PASSWORD: ${ssm:/my-app/db/password}
```

(remember to create the SSM parameter **before** deploying, else the secret will no be found)

The most secure option is to let RDS create a random password and store it in Secrets Manager:

```yaml
constructs:
    db:
        type: database/sql

functions:
    hello:
        # ...
        environment:
            DB_PASSWORD_SECRET: ${construct:db.passwordSecret}
```

The secret can then be retrieved at runtime by the Lambda function:

```js
const AWS = require('aws-sdk');
const secretsmanager = new AWS.SecretsManager();
const secret = await client.getSecretValue({
    SecretId: process.env.DB_PASSWORD_SECRET,
}).promise();
const dbPassword = secret.SecretString;
```

### More options

Looking for more options in the construct configuration? [Open a GitHub issue](https://github.com/getlift/lift/issues/new).
