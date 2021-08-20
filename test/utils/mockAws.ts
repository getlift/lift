import * as sinon from "sinon";
import type { SinonStub } from "sinon";
import * as AWS from "../../src/classes/aws";
import type { Provider as LegacyAwsProvider } from "../../src/types/serverless";

/**
 * Helper to mock the AWS SDK
 */
export function mockAws(): AwsMock {
    const awsMock = sinon.stub(AWS, "awsRequest") as AwsMock;

    awsMock.mockService = (service: string, method: string) => {
        return awsMock.withArgs(sinon.match.any, service, method, sinon.match.any).resolves();
    };

    return awsMock;
}

type AwsMock = SinonAwsMock & ExtendedAwsMock;

type SinonAwsMock = SinonStub<
    [service: string, method: string, params: unknown, provider: LegacyAwsProvider],
    Promise<unknown>
>;

interface ExtendedAwsMock {
    mockService(service: string, method: string): SinonAwsMock;
}
