# Why Lift?

## Why: Goals

Deploying to Lambda is easy. The rest is still hard. You won't build a web application using only lambdas.

Lift focuses on "the rest" (other AWS services, CloudFormation, IAM…) with 2 main goals:

- make it **simpler**
- help getting it right **for production** (good architecture)

Lift addresses both:

- experienced web developers without serverless/AWS knowledge - it reduces the AWS onboarding lead time
- experienced serverless web developers - it reduces the lead time to ship web application standard features

Addressing both those personas, we ease up our goal to maximize adoption.

## How: Constraints & Vision

Make it **simpler**:

- Simpler **technically**: replace lengthy CloudFormation stuff with a few lines of YAML
- Simpler **conceptually**: use-case focused, developer vocabulary instead of AWS vocabulary.

Help getting it right **for production** (well architected):

- By default, things deployed by Lift should be "**production-ready**" (production best practices). Services are provisioned in an opinionated way.
- Covering all possible options/configuration is not a goal.
- Provide a "dev" mode with appropriate configuration. (note: this goal isn't reached yet)

Maximize adoption:

- Open-source
- Low effort: I can install and deploy in 3 commands. Lift is familiar with existing tools and practices.
- No lock-in: I can easily eject to native CloudFormation.
- Not invasive: Minimal impact or constraint on the code or the project. 1 configuration file.

## Comparison with existing solutions

In order to achieve our goals, we first drew a picture of the current AWS serverless ecosystem. We chose to focus on 3 main evaluation criterion to rate existing solutions.

### Onboarding

- **Is it feature-oriented ?** *Being an AWS oriented framework requires the developer to have some existing knowledge of AWS services. It is not made for serverless beginners.*
- **How many steps required to get started ?** *Solution with a complicated onboarding process are cumbersome*

### Lock-in

- **Can I eject easily ?** *In case the solution does not fit my requirements anymore, can I easily opt-out without loosing everything I implemented ?*

### Features

- **Which common web features can I easily implement with the solution ?**

### Comparison table

| Criterion \ Solution | [Stackery](https://www.stackery.io/) | [Architect](https://arc.codes/docs/en/guides/get-started/quickstart) | [Laravel Vapor](https://vapor.laravel.com/) | [Amplify](https://docs.amplify.aws/) | [CDK](https://aws.amazon.com/cdk/) | [SST](https://serverless-stack.com/) | [SLS](https://www.serverless.com/) | [SLS Components](https://www.serverless.com/components/) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| *Underlying technology* | *SAM* | *SAM* | | | | *CDK* | *CFN* | |
| **Onboarding**: Feature-oriented | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Onboarding**: Steps quantity | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Lock-in**: Ejectable | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Feature**: File upload | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Feature**: Authentication | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Feature**: Asynchronous jobs | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Feature**: Database | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Feature**: Real-time feedback | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Feature**: File storage | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Feature**: Static website | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Feature**: Server-side rendering | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Feature**: HTTP API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Feature**: Webhook | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
