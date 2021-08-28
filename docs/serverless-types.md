# Lift TypeScript definitions

While YAML remains the most popular declarative syntax for Serverless service file definition - a.k.a `serverless.yml` - you can also use Javascript/TypeScript definitions - i.e. `serverless.js` and `serverless.ts`. You can find more information on using JS/TS service file in the [Serverless official documentation](https://www.serverless.com/framework/docs/providers/aws/guide/intro#services).

Generated TypeScript types for the service file from [@serverless/typescript](https://github.com/serverless/typescript) do NOT include `constructs` definition from Lift.

In order to cope this issue, Lift exports a type definition you can use in conjonction with the official Serverless definition:

_serverless.ts_
```ts
import type { AWS } from '@serverless/typescript';
import type { Lift } from "serverless-lift";

const serverlessConfiguration: AWS & Lift = {
  service: 'myService',
  frameworkVersion: '2',
  plugins: ['serverless-lift'],
  constructs: {
    avatars: {
      type: 'storage',
    },
  },
  provider: {
    name: 'aws',
    runtime: 'nodejs14.x',
  },
  functions: {
      hello: {
          handler: 'src/publisher.handler',
      }
  }
};

module.exports = serverlessConfiguration;
```
