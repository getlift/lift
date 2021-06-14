import { StorageDefinition } from "./Storage";
import { QueueDefinition } from "./Queue";
import { StaticWebsiteDefinition } from "./StaticWebsite";
import { WebhookDefinition } from "./Webhook";
import { ConstructDefinition } from "../classes/Construct";

export const constructDefinitions: Record<string, ConstructDefinition> = {
    [StorageDefinition.type]: StorageDefinition,
    [QueueDefinition.type]: QueueDefinition,
    [StaticWebsiteDefinition.type]: StaticWebsiteDefinition,
    [WebhookDefinition.type]: WebhookDefinition,
};
