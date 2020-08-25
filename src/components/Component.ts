import {pascalCase} from "pascal-case";
import {pascalCaseTransformMerge} from "pascal-case";

export abstract class Component {
    abstract compile(): Record<string, any>;

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
}
