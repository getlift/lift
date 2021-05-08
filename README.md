![](docs/lift.png)

*Shipping Serverless features made easy*

> 🚧 The project is currently a **work in progress**, expect a first beta in May.

## Features

Lift packages well-architected AWS serverless features. It is made both for developers whitout any prior serverless experience, as well as for experienced AWS builders.

- 🌐 **Allows non-serverless developers to dive in** - Developer oriented vocabulary, no AWS services knowledge required
- 📦 **Increases delivery speed** - Production-ready serverless components with minimal required configuration
- 🔁 **Leverages your existing serverless project** - Integrates with existing Serverless framework project
- ⏏️ **Does not lock you in** - Ejectable to CloudFormation at any time

[Why should I choose Lift ?](docs/comparison.md)

## Installation

```bash
npm i -D serverless-lift
```

## Quick start

*serverless.yml*

```yaml
service: my-app

plugins:
    - serverless-lift

provider:
    name: aws

static-website:
    # you can name your static website however you'd like to
    landing-page:
        # Requied. The path were your assets are.
        path: "public/landing"
        # Optional. A custom domain
        # you can also provided several domains :
        # domain:
        #   - mysiteweb.com
        #   - app.mysiteweb.com
        domain: mywebsite.com
        # Optional. ARN of an ACM certificate for the domain, registered in us-east-1
        certificate: arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123

storage:
    # you can name your storage however you'd like to
    thumbnails:
        # Optional. The kind of encryption you'd like to use. Could be either 's3' or 'kms'.
        # Default is s3.
        encryption: "s3"
        # Optional. Intelligent Tiering configuration: days before the files are moved to IA storage class.
        # Default is 45.
        archive: 30
```

## What is Lift ?

Lift is a [Serverless](https://www.serverless.com/) plugin that simplifies deploying well-designed serverless applications.

Stay updated by *Watching* the repository on GitHub.

## Components

### Static Website

Deploying static websites and single-page applications, for example React, VueJS or Angular apps.

[Get involved in the static website component internal design and interface](https://github.com/getlift/lift/discussions/5)

---

## Lift is built and maintened with love ❤️ by

<a href="https://www.theodo.fr/" title="Theodo"><img src="docs/theodo.png" width="100"></a>
<a href="https://null.tc/" title="null"><img src="docs/null.png" width="100"></a>

