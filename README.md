<!-- Lift main cover -->
![](docs/lift.png)

<!-- Lift badges -->
<p align="center">
  <img src="https://img.shields.io/github/workflow/status/getlift/lift/CI/master">
  <img src="https://img.shields.io/npm/v/serverless-lift">
  <img src="https://img.shields.io/node/v/serverless-lift">
  <img src="https://img.shields.io/npm/dw/serverless-lift">
  <img src="https://img.shields.io/npm/l/serverless-lift">
</p>

<!-- Lift usage animations -->
![](docs/animations/all.gif)

*Shipping Serverless features made easy*

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

Once installed, require the `serverless-lift` plugin and start using Lift constructs in `serverless.yml`:

```yaml
service: my-app

plugins:
  - serverless-lift

provider:
  name: aws

constructs:

  landing-page:
    type: static-website
    path: 'landing/dist'

  avatars:
    type: storage
```

## Constructs

### Static Website

Deploy static websites and single-page applications, for example React, VueJS or Angular apps.

[**Static website documentation**](docs/static-website.md)

### Storage

Deploy preconfigured S3 buckets to store files.

[**Storage documentation**](docs/storage.md)

### Queue

Deploy queues and workers for asynchronous processing.

[**Queue documentation**](docs/queue.md)

### Webhook

Deploy webhooks to receive notification from 3rd party applications.

[**Webhook documentation**](docs/webhook.md)

Got ideas for new constructs? [Open and upvote drafts](https://github.com/getlift/lift/discussions/categories/components).

---

## Lift is built and maintained with love ❤️ by

<a href="https://www.theodo.fr/" title="Theodo"><img src="docs/theodo.png" width="100"></a>
<a href="https://null.tc/" title="null"><img src="docs/null.png" width="100"></a>
