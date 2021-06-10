import * as sinon from "sinon";
import { SinonStub } from "sinon";
import * as AWS from "../../src/classes/aws";
import { Provider as LegacyAwsProvider } from "../../src/types/serverless";

export function mockAws(): AwsMock {
    const awsMock = sinon.stub(AWS, "awsRequest") as AwsMock;

    awsMock.mockService = (service: string, method: string) => {
        return awsMock.withArgs(service, method, sinon.match.any, sinon.match.any);
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
