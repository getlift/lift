import {pascalCase} from "pascal-case";
import {pascalCaseTransformMerge} from "pascal-case";
import {PolicyStatement} from "../utils/cloudformation";

export abstract class Component {
    abstract compile(): Record<string, any>;
    abstract outputs(): Record<string, any>;
    abstract permissions(): PolicyStatement[];

    formatResourceName(name: string): string {
        return pascalCase(name, {
            transform: pascalCaseTransformMerge,
        });
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
