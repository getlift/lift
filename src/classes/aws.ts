import { Provider as LegacyAwsProvider } from "../types/serverless";

// This is defined as a separate function to allow mocking in tests
export async function awsRequest<Input, Output>(
    service: string,
    method: string,
    params: Input,
    provider: LegacyAwsProvider
): Promise<Output> {
    return await provider.request<Input, Output>(service, method, params);
}
