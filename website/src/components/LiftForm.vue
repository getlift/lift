<template>
    <div class="h-screen py-16">
        <div class="grid grid-cols-2 gap-4 bg-gray-700 rounded-md h-full">
            <div class="p-6 rounded-l-md bg-gray-200">
                <prism-editor v-model="liftConfig" :highlight="highlighter" class="highlighted"></prism-editor>
            </div>
            <div class="p-6 rounded-r-md bg-gray-200 h-full overflow-y-hidden">
                <pre class="highlighted h-full overflow-y-auto" v-html="output"></pre>
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
        output = '';

        created() {
            this.refresh(this.liftConfig);
        }

        @Watch('liftConfig')
        refresh(newValue: string) {
            try {
                const stack = (new Config(newValue)).getStack();
                let output = yaml.safeDump(stack.compile());
                output = output.replace(/\nResources:\n/, '\n\nResources:\n');
                output = output.replace(/\nOutputs:\n/, '\n\nOutputs:\n');
                this.output = this.highlighter(output);
            } catch (e) {
                this.output = 'Error: ' + e.message;
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
</style>
