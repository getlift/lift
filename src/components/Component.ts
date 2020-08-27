import {pascalCase} from "pascal-case";
import {pascalCaseTransformMerge} from "pascal-case";
import {constantCase} from "constant-case";
import {PolicyStatement} from "../utils/cloudformation";

export abstract class Component {
    abstract compile(): Record<string, any>;
    abstract outputs(): Record<string, any>;
    abstract permissions(): PolicyStatement[];
    abstract envVariables(): Record<string, any>;

    formatResourceName(name: string): string {
        return pascalCase(name, {
            transform: pascalCaseTransformMerge,
        });
    }

    formatEnvVariableName(name: string): string {
        return constantCase(name);
    }

    fnRef(resource: string): object {
        return { Ref: resource };
    }

    fnGetAtt(resource: string, attribute: string): object {
        return {
            'Fn::GetAtt': [resource, attribute]
        }
    }

    fnJoin(glue: string, strings: Array<any>): object {
        return {
            'Fn::Join': [
                glue,
                strings,
            ],
        }
    }

    fnImportValue(name: string): object {
        return {
            'Fn::ImportValue': name,
        }
    }
}
