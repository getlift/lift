import type { SinonStub } from "sinon";
import type { Provider as LegacyAwsProvider } from "../../src/types/serverless";
/**
 * Helper to mock the AWS SDK
 */
export declare function mockAws(): AwsMock;
declare type AwsMock = SinonAwsMock & ExtendedAwsMock;
declare type SinonAwsMock = SinonStub<[
    service: string,
    method: string,
    params: unknown,
    provider: LegacyAwsProvider
], Promise<unknown>>;
interface ExtendedAwsMock {
    mockService(service: string, method: string): SinonAwsMock;
}
export {};
