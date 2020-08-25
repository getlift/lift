import {pascalCase} from "pascal-case";
import {pascalCaseTransformMerge} from "pascal-case";

export abstract class Component {
    abstract compile(): Record<string, any>;

    formatResourceName(name: string): string {
        return pascalCase(name, {
            transform: pascalCaseTransformMerge,
        });
    }
}
