import type { FromSchema } from "json-schema-to-ts";
import type { Construct as CdkConstruct } from "@aws-cdk/core";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import type { ConstructInterface } from "@lift/constructs";
import type { PolicyStatement } from "../../CloudFormation";

const CUSTOM_LIFT_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "customLift" },
        liftConstructPath: { type: "string" },
        configuration: { type: "object" },
    },
    additionalProperties: false,
    required: ["liftConstructPath"],
} as const;
type Configuration = FromSchema<typeof CUSTOM_LIFT_DEFINITION>;

export class CustomLift extends AwsConstruct {
    public static type = "customLift";
    public static schema = CUSTOM_LIFT_DEFINITION;

    private customLiftConstruct: ConstructInterface;

    constructor(
        scope: CdkConstruct,
        private readonly id: string,
        private readonly configuration: Configuration,
        private readonly provider: AwsProvider
    ) {
        super(scope, id);

        // dynamically import the file pointed by the path and compile it if it's a typescript file
        const liftConstructClass = importConstruct(this.configuration.liftConstructPath);

        // Imported file can contain anything. It should be validated
        checkIsLiftConstruct(liftConstructClass);

        // The construct is only used to produce CloudFormation. It can't produce side effects such as artefacts upload.
        checkConstructCanBeDeployed(liftConstructClass);

        this.customLiftConstruct = new liftConstructClass(
            scope,
            "CDKConstruct",
            this.configuration.configuration ?? {},
            provider
        );
    }
    outputs(): Record<string, () => Promise<string | undefined>> {
        return this.customLiftConstruct.outputs?.() ?? {};
    }
    variables(): Record<string, unknown> {
        return this.customLiftConstruct.variables?.() ?? {};
    }
    postDeploy(): Promise<void> {
        return this.customLiftConstruct.postDeploy?.() ?? Promise.resolve();
    }
    preRemove(): Promise<void> {
        return this.customLiftConstruct.preRemove?.() ?? Promise.resolve();
    }
    permissions(): PolicyStatement[] {
        return this.customLiftConstruct.permissions?.() ?? [];
    }
}
