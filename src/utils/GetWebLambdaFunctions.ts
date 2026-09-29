import { WebLambdaFunctionInterface } from "../interfaces/WebLambdaFunctionInterface";

export function GetWebLambdaFunctions(functions: any): WebLambdaFunctionInterface[] {
    if (functions === undefined) {
        return [];
    }

    return Object.keys(functions)
        .filter((key) => {
            const fn = functions[key];

            return fn.url !== undefined || (fn.events !== undefined && fn.events.some((e: any) => e.httpApi || e.http || e.alb));
        })
        .map((key) => {
            return {
                name: key,
                usesLambdaUrl: functions[key].url !== undefined,
            };
        })
    ;
}
