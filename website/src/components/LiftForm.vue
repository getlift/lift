<template>
    <div class="py-16">
        <div class="grid grid-cols-2 gap-4 bg-gray-700 rounded-md">
            <div class="p-6 rounded-l-md bg-gray-200">
                <prism-editor v-model="liftConfig" :highlight="highlighter" class="highlighted"></prism-editor>
            </div>
            <div class="rounded-r-md bg-gray-200 overflow-hidden">
                <div class="p-6 bg-gray-400">
                    <h2 class="font-mono text-gray-800 mb-3">cloudformation.yml</h2>
                    <div class="text-xs text-gray-600">
                        <code class="font-mono">aws cloudformation deploy --template cloudformation.yml --stack-name {{ stackName }}</code>
                    </div>
                </div>
                <div class="p-6">
                    <pre class="highlighted text-sm" v-html="cloudformation"></pre>
                </div>
                <div class="p-6 bg-gray-400 font-mono">
                    <h2 class="font-mono text-gray-800 mb-3">serverless.yml</h2>
                    <div class="text-xs text-gray-600">
                        <code class="font-mono">serverless deploy</code>
                    </div>
                </div>
                <div class="p-6">
                    <pre class="highlighted text-sm" v-html="serverlessTemplate"></pre>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import {Component, Vue, Watch} from 'vue-property-decorator';
    import {Config} from "../../../src/Config";
    import * as yaml from "js-yaml";
    import { PrismEditor } from 'vue-prism-editor';
    import { highlight, languages } from 'prismjs';
    import 'prismjs/components/prism-yaml';

    @Component({
        components: {
            PrismEditor,
        }
    })
    export default class LiftForm extends Vue {
        liftConfig = `name: myproject

s3:
    # Uncomment to create S3 buckets:
#    avatars:
#        public: true
#        cors: true
#    storage:

# Uncomment to create a database:
#db:
#    engine: postgres

# Uncomment to create a static website:
# (S3 bucket + CloudFront CDN)
#static-website:
#    domain: example.com
#    certificate: 'arn:aws:acm:us-east-1:xxx:...'`;
        stackName = '';
        cloudformation = '';
        serverlessTemplate = '';

        created() {
            this.refresh(this.liftConfig);
        }

        @Watch('liftConfig')
        async refresh(newValue: string) {
            try {
                const stack = (new Config('myproject', 'us-east-1', newValue)).getStack();
                this.stackName = stack.name;

                // Cloudformation
                let output = yaml.safeDump(stack.compile(), {
                    noRefs: true,
                });
                output = output.replace(/\nResources:\n/, '\n\nResources:\n');
                output = output.replace(/\nOutputs:\n/, '\n\nOutputs:\n');
                this.cloudformation = this.highlighter(output);

                // serverless.yml
                const variables = yaml.safeDump(await stack.variables(), {
                    noRefs: true,
                })
                    .replace(/\n/g, '\n        ')
                    .trimEnd();
                const permissions = yaml.safeDump(await stack.permissions(), {
                    noRefs: true,
                })
                    .replace(/\n/g, '\n        ')
                    .trimEnd();
                this.serverlessTemplate = this.highlighter(`provider:
    name: aws
    # Environment variables
    environment:
        ${variables}
    # Permissions applied to Lambda functions
    iamRoleStatements:
        ${permissions}
# ...`);
            } catch (e) {
                this.cloudformation = 'Error: ' + e.message;
                this.serverlessTemplate = '';
            }
        }

        highlighter(code: string) {
            return highlight(code, languages.yaml, 'yaml');
        }
    }
</script>

<style scoped>
.highlighted {
    @apply font-mono p-0 m-0 bg-transparent leading-8 text-base whitespace-pre-wrap !important;
}
.highlighted.text-sm {
    @apply text-sm !important;
}
</style>
