![](docs/lift.png)

Lift is a plugin that leverages the AWS CDK to expand the [Serverless Framework](https://www.serverless.com/) beyond functions.

Deploy production-ready websites, queues, storage buckets and more with a few lines in serverless.yml.

⚡️ **For developers** - No AWS knowledge required
⚡️ **Production-ready** - Built by AWS experts, optimized for production
⚡️ **Not invasive** - Integrates with existing projects
⚡️ **No lock-in** - Eject to CloudFormation at any time

[Why should I choose Lift ?](docs/comparison.md)

## Installation

Lift is a [Serverless Framework plugin](https://www.serverless.com/plugins/), install it in your project via:

```bash
serverless plugin install --name=serverless-lift
```

## Quick start

Once installed, start using Lift constructs in `serverless.yml`:

```yaml
service: my-app

provider:
    name: aws

plugins:
    - serverless-lift

constructs:

    # Add Lift constructs here

    landing-page:
        type: static-website
        path: 'landing/dist'

    avatars:
        type: storage
```

## Constructs

#### [**Static website**](docs/static-website.md)

Deploy static websites and single-page applications, for example React, VueJS or Angular apps.

```yaml
constructs:
    landing:
        type: static-website
        path: dist
```

[Read more...](docs/static-website.md)

#### [**Storage**](docs/storage.md)

Deploy preconfigured S3 buckets to store files.

```yaml
constructs:
    avatars:
        type: storage
```

[Read more...](docs/storage.md)

#### [**Queue**](docs/queue.md)

Deploy SQS queues and workers for asynchronous processing.

```yaml
constructs:
    my-queue:
        type: queue
        worker:
            handler: src/report-generator.handler
```

[Read more...](docs/queue.md)

#### [**Webhook**](docs/webhook.md)

Deploy webhooks to receive notification from 3rd party applications.

```yaml
constructs:
    stripe-webhook:
        path: /my-webhook-endpoint
        authorizer:
            handler: myAuthorizer.main
```

[Read more...](docs/webhook.md)

Got ideas for new constructs? [Open and upvote drafts](https://github.com/getlift/lift/discussions/categories/components).

---

## Lift is built and maintained with love ❤️ by

<a href="https://www.theodo.fr/" title="Theodo"><img src="docs/theodo.png" width="100"></a>
<a href="https://null.tc/" title="null"><img src="docs/null.png" width="100"></a>
