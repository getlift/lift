# React website

The `react-website` construct deploys React websites created with [Create React App](https://create-react-app.dev/).

## Quick start

```bash
serverless plugin install -n serverless-lift
```

```yaml
service: my-app
provider:
    name: aws

constructs:
    website:
        type: react-website

plugins:
    - serverless-lift
```

On `serverless deploy`, the application will be built (via `npm run build`) and deployed as a public website.

_Note: **the first deployment takes 4 minutes**. Next deployments only take seconds._

The website is served over HTTPS and cached all over the world via the CloudFront CDN.

## How it works

The `react-website` construct is based on the [`static-website` construct: read its documentation to learn more](static-website.md#how-it-works).

## Commands

The following commands are available on `react-website` constructs:

```
serverless <construct-name>:upload
serverless <construct-name>:dev
serverless <construct-name>:build
```

- `serverless <construct-name>:upload`

`serverless deploy` deploys everything configured in `serverless.yml` and uploads website files.

`serverless <construct-name>:upload` skips the build and CloudFormation deployment: it directly uploads files to S3 and clears the CloudFront cache.

- `serverless <construct-name>:dev`

Runs the React website locally via `npm start`.

- `serverless <construct-name>:build`

Builds the React website locally via `npm run build`.

Note: `serverless deploy` automatically builds the website before deploying.

## Configuration reference

### Custom domain

```yaml
constructs:
    landing:
        # ...
        domain: mywebsite.com
        # ARN of an ACM certificate for the domain, registered in us-east-1
        certificate: arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123
```

The configuration above will activate the custom domain `mywebsite.com` on CloudFront, using the provided HTTPS certificate.

After running `serverless deploy` (or `serverless info`), you should see the following output in the terminal:

```
landing:
  url: https://mywebsite.com
  cname: s13hocjp.cloudfront.net
```

Create a CNAME DNS entry that points your domain to the `xxx.cloudfront.net` domain. After a few minutes/hours, the domain should be available.

#### HTTPS certificate

To create the HTTPS certificate:

- Open [the ACM Console](https://console.aws.amazon.com/acm/home?region=us-east-1#/wizard/) in the `us-east-1` region (CDN certificates _must be_ in us-east-1, regardless of where your application is hosted)
- Click "_Request a new certificate_", add your domain name and click "Next"
- Choose a domain validation method:
  - Domain validation will require you to add CNAME entries to your DNS configuration
  - Email validation will require you to click a link in an email sent to `admin@your-domain.com`

After the certificate is created and validated, you should see the ARN of the certificate.

#### Multiple domains

It is possible to set up multiple domains:

```yaml
constructs:
    landing:
        # ...
        domain:
            - mywebsite.com
            - app.mywebsite.com
```

### Allow iframes

By default, as recommended [for security reasons](https://scotthelme.co.uk/hardening-your-http-response-headers/#x-frame-options), the static website cannot be embedded in an iframe.

To allow embedding the website in an iframe, set it up explicitly:

```yaml
constructs:
    landing:
        # ...
        security:
            allowIframe: true
```

### More options

Looking for more options in the construct configuration? [Open a GitHub issue](https://github.com/getlift/lift/issues/new).
