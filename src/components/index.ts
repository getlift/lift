import { Storage, STORAGE_DEFINITION } from "./Storage";
import { Queue, QUEUE_DEFINITION } from "./Queue";
import { STATIC_WEBSITE_DEFINITION, StaticWebsite } from "./StaticWebsite";
import { Webhook, WEBHOOK_DEFINITION } from "./Webhook";

export const constructs = {
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
