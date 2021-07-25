import type { FromSchema } from "json-schema-to-ts";
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

    constructor(
        private readonly provider: StripeProvider,
        private readonly id: string,
        private readonly configuration: Configuration
    ) {
        super();
        const resolvedConfiguration = Object.assign({}, configuration);
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {};
    }

    variables(): Record<string, unknown> {
        return {};
    }
}
