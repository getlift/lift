import type { FromSchema } from "json-schema-to-ts";
import type { Stripe } from "stripe";
import type { StripeProvider } from "@lift/providers";
import { StripeConstruct } from "@lift/constructs/abstracts";

const WEBHOOK_DEFINITION = {
    type: "object",
    properties: {
        url: { type: "string" },
        enabledEvents: { type: "array", items: { type: "string" } },
    },
    required: ["url", "enabledEvents"],
    additionalProperties: false,
} as const;

type Configuration = FromSchema<typeof WEBHOOK_DEFINITION>;

export class Webhook extends StripeConstruct {
    public static type = "webhook";
    public static schema = WEBHOOK_DEFINITION;

    private readonly sdk: Stripe;

    constructor(
        private readonly provider: StripeProvider,
        private readonly id: string,
        private readonly configuration: Configuration
    ) {
        super();
        this.sdk = provider.sdk;
        const resolvedConfiguration = Object.assign({}, configuration);
    }

    protected async add(configuration: Configuration): Promise<void> {
        if (configuration.enabledEvents.every(this.validateEvent)) {
            const webhook = await this.sdk.webhookEndpoints.create({
                url: configuration.url,
                enabled_events: configuration.enabledEvents,
            });
            this.provider.referenceNewStripeResources(this.id, webhook.id);
        }
    }

    protected async update(resources: string, configuration: Configuration): Promise<void> {
        const webhookId = this.provider.getStripeResources(this.id);
        if (typeof webhookId !== "string") {
            throw new Error("This should not happen");
        }
        if (configuration.enabledEvents.every(this.validateEvent)) {
            await this.sdk.webhookEndpoints.update(webhookId, {
                url: configuration.url,
                enabled_events: configuration.enabledEvents,
            });
        }
    }

    protected async destroy(resources: string): Promise<void> {
        const webhookId = this.provider.getStripeResources(this.id);
        if (typeof webhookId !== "string") {
            throw new Error("This should not happen");
        }
        await this.sdk.webhookEndpoints.del(webhookId);
    }

    private validateEvent(event: string): event is Stripe.WebhookEndpointCreateParams.EnabledEvent {
        return true;
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {};
    }

    variables(): Record<string, unknown> {
        return {};
    }
}
