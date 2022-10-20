import type { AwsProvider } from "@lift/providers";
import type { Provider as LegacyAwsProvider } from "../types/serverless";
export declare function awsRequest<Input, Output>(params: Input, service: string, method: string, provider: LegacyAwsProvider): Promise<Output>;
export declare function emptyBucket(aws: AwsProvider, bucketName: string): Promise<void>;
export declare function invalidateCloudFrontCache(aws: AwsProvider, distributionId: string): Promise<void>;
