import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from "@aws-cdk/aws-s3";
import type { Construct as CdkConstruct } from "@aws-cdk/core";
import { CfnOutput, Duration, Fn, Stack } from "@aws-cdk/core";
import { Code, Function as LambdaFunction, Runtime } from "@aws-cdk/aws-lambda";
import type { FromSchema } from "json-schema-to-ts";
import type { AwsProvider } from "@lift/providers";
import { AwsConstruct } from "@lift/constructs/abstracts";
import type { IHttpApi } from "@aws-cdk/aws-apigatewayv2";
import { HttpApi, HttpMethod, HttpRoute, HttpRouteKey } from "@aws-cdk/aws-apigatewayv2";
import type { Resource } from "@aws-cdk/aws-apigateway";
import { LambdaIntegration, RestApi } from "@aws-cdk/aws-apigateway";
import { LambdaProxyIntegration } from "@aws-cdk/aws-apigatewayv2-integrations";
import { Role } from "@aws-cdk/aws-iam";
import { PolicyStatement } from "../../CloudFormation";

const UPLOAD_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "upload" },
        apiGateway: { enum: ["http", "rest"] },
        encryption: {
            anyOf: [{ const: "s3" }, { const: "kms" }],
        },
    },
    additionalProperties: false,
} as const;
const UPLOAD_DEFAULTS: Required<FromSchema<typeof UPLOAD_DEFINITION>> = {
    type: "upload",
    encryption: "s3",
    apiGateway: "http",
};

type Configuration = FromSchema<typeof UPLOAD_DEFINITION>;

export class Upload extends AwsConstruct {
    public static type = "upload";
    public static schema = UPLOAD_DEFINITION;

    private readonly bucket: Bucket;
    private readonly bucketNameOutput: CfnOutput;
    private function: LambdaFunction;
    private httpApi: IHttpApi | undefined;
    private route: HttpRoute | undefined;
    private restApi: RestApi | undefined;

    constructor(scope: CdkConstruct, id: string, configuration: Configuration, private provider: AwsProvider) {
        super(scope, id);

        const resolvedConfiguration = Object.assign({}, UPLOAD_DEFAULTS, configuration);

        const encryptionOptions = {
            s3: BucketEncryption.S3_MANAGED,
            kms: BucketEncryption.KMS_MANAGED,
        };

        this.bucket = new Bucket(this, "Bucket", {
            encryption: encryptionOptions[resolvedConfiguration.encryption],
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            cors: [
                {
                    allowedMethods: [HttpMethods.PUT],
                    allowedOrigins: ["*"],
                    allowedHeaders: ["*"],
                },
            ],
            lifecycleRules: [
                {
                    expiration: Duration.days(1),
                },
            ],
        });

        this.bucketNameOutput = new CfnOutput(this, "BucketName", {
            value: this.bucket.bucketName,
        });

        this.function = new LambdaFunction(this, "Function", {
            code: Code.fromInline(this.createFunctionCode()),
            handler: "index.handler",
            runtime: Runtime.NODEJS_12_X,
            environment: {
                LIFT_UPLOAD_BUCKET_NAME: this.bucket.bucketName,
            },
            role: Role.fromRoleArn(
                this,
                "LambdaRole",
                Fn.getAtt(this.provider.naming.getRoleLogicalId(), "Arn").toString()
            ),
        });

        if (resolvedConfiguration.apiGateway === "http") {
            this.provider.enableHttpApiCors();
            this.httpApi = HttpApi.fromHttpApiAttributes(this, "HttpApi", {
                httpApiId: Fn.ref(this.provider.naming.getHttpApiLogicalId()),
            });

            this.route = new HttpRoute(this, "Route", {
                httpApi: this.httpApi,
                integration: new LambdaProxyIntegration({
                    handler: this.function,
                }),
                routeKey: HttpRouteKey.with("/upload-url", HttpMethod.POST),
            });
        }

        if (resolvedConfiguration.apiGateway === "rest") {
            this.restApi = RestApi.fromRestApiAttributes(this, "RestApi", {
                restApiId: Fn.ref(this.provider.naming.getRestApiLogicalId()),
                rootResourceId: Fn.getAtt(this.provider.naming.getRestApiLogicalId(), "RootResourceId").toString(),
            }) as RestApi;

            const resource: Resource = this.restApi.root.addResource("upload-url");
            resource.addCorsPreflight({
                allowHeaders: ["*"],
                allowMethods: ["POST"],
                allowOrigins: ["*"],
            });
            resource.addMethod("POST", new LambdaIntegration(this.function));
        }
    }

    variables(): Record<string, unknown> {
        return {
            bucketArn: this.bucket.bucketArn,
            bucketName: this.bucket.bucketName,
        };
    }

    permissions(): PolicyStatement[] {
        return [
            new PolicyStatement(
                ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
                [this.bucket.bucketArn, Stack.of(this).resolve(Fn.join("/", [this.bucket.bucketArn, "*"]))]
            ),
        ];
    }

    outputs(): Record<string, () => Promise<string | undefined>> {
        return {
            bucketName: () => this.getBucketName(),
        };
    }

    async getBucketName(): Promise<string | undefined> {
        return this.provider.getStackOutput(this.bucketNameOutput);
    }

    private createFunctionCode(): string {
        return `
const AWS = require('aws-sdk');
const crypto = require("crypto");
const s3 = new AWS.S3();

exports.handler = async (event) => {
    const body = JSON.parse(event.body);
    const fileName = \`tmp/\${crypto.randomBytes(5).toString('hex')}-\${body.fileName}\`;

    const url = s3.getSignedUrl('putObject', {
        Bucket: process.env.LIFT_UPLOAD_BUCKET_NAME,
        Key: fileName,
        ContentType: body.contentType,
        Expires: 60 * 5,
    });

    return {
        body: JSON.stringify({
           fileName: fileName,
           uploadUrl: url,
        }),
        headers: {
            "Access-Control-Allow-Origin": event.headers.origin,
        },
        statusCode: 200
    };
}
        `;
    }
}
