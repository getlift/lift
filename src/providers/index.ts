import { ConstructInterface, StaticConstructInterface } from "@lift/constructs";

export { AwsProvider } from "./AwsProvider";
export { StripeProvider } from "./StripeProvider";

export interface ProviderInterface {
    create(type: string, id: string): ConstructInterface;
}

export interface StaticProviderInterface {
    getConstructClass(type: string): StaticConstructInterface | undefined;
    getAllConstructClasses(): StaticConstructInterface[];
}
