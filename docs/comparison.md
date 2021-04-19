# Why should I choose Lift ?

## Criterion

In order to achieve Lift goals, we first draw a picture of the current AWS serverless ecosystem. We chose to focus on 3 main evaluation criterion to rate existing solutions.

### Onboarding

- **Is it feature-oriented ?** *Being an AWS oriented framework requires the developer to have some existing knowledge of AWS services. It is not made for serverless beginners.*
- **How many steps required to get started ?** *Solution with a complicated onboarding process are cumbersome*

### Lock-in

- **Can I eject easily ?** *In case the solution does not fit my requirements anymore, can I easily opt-out without loosing everything I implemented ?*

### Features

- **Which common web features can I easily implement with the solution ?**

## Comparison table

| Criterion \ Solution | [Stackery](https://www.stackery.io/) | [Architect](https://arc.codes/docs/en/guides/get-started/quickstart) | [Laravel Vapor](https://vapor.laravel.com/) | [Amplify](https://docs.amplify.aws/) | [CDK](https://aws.amazon.com/cdk/) | [SST](https://serverless-stack.com/) | [SLS](https://www.serverless.com/) | [SLS Components](https://www.serverless.com/components/) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Underlying technology | SAM | SAM | | | | CDK | CFN | |
| Feature-oriented | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Onboarding steps | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Ejectable | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
