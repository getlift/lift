# Static website

The `static-website` construct deploys **plain static websites** composed of HTML files and assets (CSS, JS…).

*Note: to deploy single-page applications (like React), use the [`single-page-app` construct instead](./single-page-app.md).*

## Quick start

```bash
serverless plugin install -n serverless-lift
```

```yaml
service: my-app
provider:
    name: aws

constructs:
    landing:
        type: static-website
        path: public

plugins:
    - serverless-lift
```

On `serverless deploy`, the `public/` directory will be deployed as a public website.

_Note: **the first deployment takes 4 minutes**. Next deployments only take seconds._

The website is served over HTTPS and cached all over the world via the CloudFront CDN.

## How it works

On the first `serverless deploy`, Lift creates:

- an [S3](https://aws.amazon.com/s3/) bucket
- a [CloudFront CDN](https://aws.amazon.com/cloudfront/) configured to serve the website from S3 over HTTPS, with caching at the edge
- CloudFront Functions to set security HTTP headers

![](img/static-website.png)

Additionally, every time `serverless deploy` runs, Lift:

- uploads all files from the configured directory to the S3 bucket
- invalidates the CloudFront cache so that the new version of the website is live

To learn more about the architecture of this construct, [read this article](https://medium.com/serverless-transformation/static-websites-on-aws-designing-lift-1db94574ba3b).

_Note: the S3 bucket is entirely managed by Lift. Do not store or upload files to the bucket, they will be removed by Lift on the next deployment. Instead, create a separate bucket to store any extra file._

## Example

To deploy a static website, use the following configuration:

```yaml
constructs:
    landing:
        type: static-website
        path: public
```

To deploy, run:

```
npm run build
serverless deploy
```

## Commands

`serverless deploy` deploys everything configured in `serverless.yml` and uploads website files.

It is possible to skip the CloudFormation deployment and directly publish website changes via:

```
serverless <construct-name>:upload

# For example:
serverless landing:upload
```

This command only takes seconds: it directly uploads files to S3 and clears the CloudFront cache.

## Variables

All static-website constructs expose the following variables:

- `cname`: the domain name of the resource, such as `d111111abcdef8.cloudfront.net`

This can be used to reference the bucket from Route53 configuration, for example:

```yaml
constructs:
    landing:
        type: static-website
        path: public

resources:
  Resources:
    Route53Record:
      Type: AWS::Route53::RecordSet
      Properties:
        HostedZoneId: ZXXXXXXXXXXXXXXXXXXJ # Your HostedZoneId
        Name: app.mydomain
        Type: A
        AliasTarget:
          HostedZoneId: Z2FDTNDATAQYW2 # Cloudfront Route53 HostedZoneId. This does not change.
          DNSName: ${construct:landing.cname}
```

_How it works: the `${construct:landing.cname}` variable will automatically be replaced with a CloudFormation reference to the CloudFront Distribution._

## Configuration reference

### Path

```yaml
constructs:
    landing:
        type: static-website
        path: public
```

The `path` option should point to the local directory containing the static website. Use `path: .` to upload the content of the current directory.

All files in that directory will be deployed and made available publicly.

When using a JavaScript bundler (for example when working with Webpack, VueJS, React, etc.), upload the compiled files. For example this could be the `dist/` directory.

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

#### Redirect all domains to a single one

It is sometimes necessary to redirect one or several domains to a single one. A common example is to redirect the root domain to the `www` version.

```yaml
constructs:
    website:
        # ...
        domain:
            - www.mywebsite.com
            - mywebsite.com
        redirectToMainDomain: true
```

The first domain in the list will be considered the main domain. In this case, `mywebsite.com` will redirect to `www.mywebsite.com`.

### Error page

By default, all 404 requests are redirected to `index.html` with a 200 response status. This behavior is optimized for Single-Page Applications: it allows doing client-side URL routing with JavaScript frameworks.

For static websites that _are not SPA_, it is possible to serve a custom "Not found" error page:

```yaml
constructs:
    landing:
        # ...
        errorPage: error.html # can be any HTML file in your project
```

When a browser requests the URL of a non-existing file, the `error.html` file will be served with a 404 response status.

Do not use this setting when doing JavaScript URL routing: this will break URL routing.

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
