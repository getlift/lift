![](docs/lift.png)

*Shipping Serverless features made easy*

> 🚧 The project is currently a **work in progress**, expect a first beta in May.
>
> Stay updated by *Watching* the repository.

## Features

Lift is a [Serverless](https://www.serverless.com/) plugin that simplifies deploying well-architected serverless applications.

It is made for developers new to serverless, as well as experienced AWS builders.

- ⚡️ **Get started with Serverless** - Developer-friendly vocabulary, no AWS knowledge required
- 📦 **Faster delivery** - Production-ready components with minimal configuration
- 🔁 **Not invasive** - Integrates with existing Serverless Framework projects
- ⏏️ **No lock-in** - Eject to CloudFormation at any time

[Why should I choose Lift ?](docs/comparison.md)

## Installation

```bash
npm i -D serverless-lift
```

## Quick start

Once installed, require the `serverless-lift` plugin and start using Lift components in `serverless.yml`:

```yaml
service: my-app

plugins:
  - serverless-lift

provider:
  name: aws

static-website:
  landing-page:
    path: 'landing/dist'
    domain: mywebsite.com

storage:
  avatars:
    encrypted: true
```

## Components

### Static Website

Deploy static websites and single-page applications, for example React, VueJS or Angular apps.

[**Static website documentation**](docs/static-websites.md)

### Storage

Deploy preconfigured S3 buckets to store files.

[**Storage documentation**](docs/storage.md)

### Queue

Deploy queues and workers for asynchronous processing.

[**Queues documentation**](docs/queues.md)

Got ideas for new components? [Open and upvote component drafts](https://github.com/getlift/lift/discussions/categories/components).

### Webhooks

Deploy webhooks to receive notification from 3rd party applications.

[**Webhooks documentation**](docs/webhooks.md)

Got ideas for new components? [Open and upvote component drafts](https://github.com/getlift/lift/discussions/categories/components).

---

## Lift is built and maintained with love ❤️ by

<a href="https://www.theodo.fr/" title="Theodo"><img src="docs/theodo.png" width="100"></a>
<a href="https://null.tc/" title="null"><img src="docs/null.png" width="100"></a>
