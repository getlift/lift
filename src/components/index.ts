import { Storage, STORAGE_DEFINITION } from "./Storage";
import { Queue, QUEUE_DEFINITION } from "./Queue";
import { STATIC_WEBSITE_DEFINITION, StaticWebsite } from "./StaticWebsite";
import { Webhook, WEBHOOK_DEFINITION } from "./Webhook";
import { CDK_CONSTRUCT_DEFINITION, CdkConstruct } from "./CdkConstruct";

export const constructs = {
    cdk: {
        class: CdkConstruct,
        schema: CDK_CONSTRUCT_DEFINITION,
    },
    storage: {
        class: Storage,
        schema: STORAGE_DEFINITION,
    },
    queue: {
        class: Queue,
        schema: QUEUE_DEFINITION,
    },
    "static-website": {
        class: StaticWebsite,
        schema: STATIC_WEBSITE_DEFINITION,
    },
    webhook: {
        class: Webhook,
        schema: WEBHOOK_DEFINITION,
    },
};
