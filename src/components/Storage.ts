import { Component, Serverless } from "../classes/Component";

const LIFT_COMPONENT_NAME_PATTERN = "^[a-zA-Z0-9-_]+$";
const STORAGE_COMPONENT = "storage";
const STORAGE_DEFINITION = {
    type: "object",
    patternProperties: {
        [LIFT_COMPONENT_NAME_PATTERN]: {
            type: "object",
            properties: {
                cors: {
                    anyOf: [{ type: "boolean" }, { type: "string" }],
                },
                encrypted: { type: "boolean" },
                public: { type: "boolean" },
            },
            additionalProperties: false,
        },
    },
} as const;

export class Storage extends Component<
    typeof STORAGE_COMPONENT,
    typeof STORAGE_DEFINITION
> {
    public readonly commands: Record<string, unknown>;

    constructor(serverless: Serverless) {
        super({
            name: STORAGE_COMPONENT,
            serverless,
            schema: STORAGE_DEFINITION,
        });

        this.commands = {
            foo: {
                lifecycleEvents: ["functions"],
                options: {
                    function: {
                        usage:
                            'Specify the function you want to handle (e.g. "--function myFunction")',
                        required: false,
                        type: "string", // Possible options: "string", "boolean", "multiple"
                    },
                },
            },
        };
    }

    do(): void {
        const conf = this.getConfiguration();
        const name = this.getName();
    }
}
