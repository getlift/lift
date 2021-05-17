# Static websites

The `static-website` component deploys:

- **single-page applications**, for example React or VueJS applications
- **plain static websites** composed of HTML files and assets (CSS, JS…)

## Quick start

```yaml
service: my-app
provider:
  name: aws

static-website:
  landing:
    path: 'public'

plugins:
    - serverless-lift
```

On `serverless deploy`, the `public/` directory will be deployed as a public website.

_Note: **the first deployment takes 5 minutes**. Next deployments only take seconds._

The website is served over HTTPS and cached all over the world via the CloudFront CDN.

## How it works

On the first `serverless deploy`, Lift creates:

- an S3 bucket
- a CloudFront CDN configured to serve the website from S3 over HTTPS, with caching at the edge

Additionally, every time `serverless deploy` runs, Lift:

- uploads all files of the `public/` directory to the S3 bucket
- invalidates the CloudFront cache so that the new version of the website is live

To learn more about the architecture of this component, [read this article](https://medium.com/serverless-transformation/static-websites-on-aws-designing-lift-1db94574ba3b).

_Note: the S3 bucket is public and entirely managed by Lift. Do not store or upload files to the bucket, they will be removed by Lift on the next deployment._

## Configuration reference

It is possible to create multiple websites:

```yaml
static-website:
  landing:
    path: 'landing/dist'
  admin-panel:
    path: 'admin/dist'
```

### Custom domain

```yaml
static-website:
  landing:
    ...
    domain: mywebsite.com
    # ARN of an ACM certificate for the domain, registered in us-east-1
    certificate: arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123
```

The configuration above will activate the custom domain `mywebsite.com` on CloudFront, using the provided HTTPS certificate.

After running `serverless deploy` (or `serverless info`), you should see the following output in the terminal:

```
static websites:
  landing: https://mywebsite.com (CNAME: s1p63x3kjhocjp.cloudfront.net)
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

It is possible to register multiple domains:

```yaml
static-website:
  landing:
    ...
    domain:
      - mywebsite.com
      - app.mywebsite.com
```

### More options

Looking for more options in the component configuration? [Open a GitHub issue](https://github.com/getlift/lift/issues/new).
