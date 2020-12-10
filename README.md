## Installation

```bash
npm -g i @mnapoli/lift
```

## Usage

Create a `lift.yml` file in your project:

```yaml
name: externals
region: eu-west-1

# let's add a database for the example:
db:
```

Deploy your stack:

```bash
lift up
```
