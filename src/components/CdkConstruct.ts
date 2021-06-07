import * as cdk from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import * as path from "path";
import Construct from "../classes/Construct";

export const CDK_CONSTRUCT_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "cdk" },
        file: { type: "string" },
    },
    required: ["type", "file"],
} as const;

export class CdkConstruct implements Construct {
    constructor(scope: cdk.Construct, id: string, configuration: FromSchema<typeof CDK_CONSTRUCT_DEFINITION>) {
        const props: Record<string, any> = Object.assign({}, configuration);
        delete props.type;
        delete props.file;

        const C = require(path.join(process.cwd(), configuration.file));
        new C(scope, id, props);
    }

    references(): Record<string, Record<string, unknown>> {
        return {};
    }

    commands(): Record<string, () => void | Promise<void>> {
        return {};
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {};
    }
}
