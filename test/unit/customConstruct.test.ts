import { runServerlessCli } from "../utils/runServerlessCli";

describe("custom constructs", () => {
    it("should be able to define AWS resources", async () => {
        const { cfTemplate } = await runServerlessCli({
            fixture: "customConstruct",
            command: "package",
        });
        expect(Object.keys(cfTemplate.Resources)).toStrictEqual([
            "ServerlessDeploymentBucket",
            "ServerlessDeploymentBucketPolicy",
            "fooQueue8CBBB428",
        ]);
        expect(cfTemplate.Resources.fooQueue8CBBB428).toStrictEqual({
            Type: "AWS::SQS::Queue",
            UpdateReplacePolicy: "Delete",
            DeletionPolicy: "Delete",
            Properties: {
                QueueName: "custom-dev-foo",
                MessageRetentionPeriod: 345600,
            },
        });
    });
});
