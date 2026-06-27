import { SQSClient } from "@aws-sdk/client-sqs";
import * as sinon from "sinon";
import { getAwsSdkV3Config } from "../../src/classes/aws";
import { AwsProvider } from "../../src/providers/AwsProvider";
import type { Provider as LegacyAwsProvider, Serverless } from "../../src/types/serverless";

describe("AWS SDK v3 integration", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("uses framework AWS SDK v3 config when available", async () => {
        const getAwsSdkV3ConfigStub = sinon.stub().resolves({ region: "eu-west-1" });
        const provider = {
            getAwsSdkV3Config: getAwsSdkV3ConfigStub,
            getCredentials: sinon.stub().throws(new Error("getCredentials should not be called")),
            getRegion: sinon.stub().throws(new Error("getRegion should not be called")),
        } as unknown as LegacyAwsProvider;

        await expect(getAwsSdkV3Config(provider)).resolves.toEqual({ region: "eu-west-1" });

        expect(getAwsSdkV3ConfigStub.calledOnce).toBe(true);
    });

    it("builds AWS SDK v3 config from legacy framework credentials when needed", async () => {
        const credentials = {
            accessKeyId: "access-key-id",
            secretAccessKey: "secret-access-key",
            sessionToken: "session-token",
            getPromise: sinon.stub().resolves(),
        };
        const provider = {
            getCredentials: sinon.stub().returns({ credentials }),
            getRegion: sinon.stub().returns("eu-west-1"),
        } as unknown as LegacyAwsProvider;

        await expect(getAwsSdkV3Config(provider)).resolves.toEqual({
            region: "eu-west-1",
            credentials: {
                accessKeyId: "access-key-id",
                secretAccessKey: "secret-access-key",
                sessionToken: "session-token",
            },
        });

        expect(credentials.getPromise.calledOnce).toBe(true);
    });

    it("creates and caches AWS SDK v3 clients", async () => {
        const getAwsSdkV3ConfigStub = sinon.stub().resolves({ region: "eu-west-1" });
        const provider = createAwsProvider({
            getAwsSdkV3Config: getAwsSdkV3ConfigStub,
        });

        const firstClient = await provider.getSqsClient();
        const secondClient = await provider.getSqsClient();

        expect(firstClient).toBeInstanceOf(SQSClient);
        expect(secondClient).toBe(firstClient);
        expect(getAwsSdkV3ConfigStub.calledOnce).toBe(true);
    });
});

function createAwsProvider(provider: Partial<LegacyAwsProvider>): AwsProvider {
    const legacyProvider = {
        naming: {
            getStackName: sinon.stub().returns("stack-name"),
        },
        getRegion: sinon.stub().returns("eu-west-1"),
        ...provider,
    } as unknown as LegacyAwsProvider;
    const serverless = {
        getProvider: sinon.stub().returns(legacyProvider),
        configurationInput: {},
        service: {
            provider: {},
            setFunctionNames: sinon.stub(),
        },
        processedInput: {
            options: {},
        },
    } as unknown as Serverless;

    return new AwsProvider(serverless);
}
