import {Component} from "./Component";
import {PolicyStatement} from "../utils/cloudformation";

export class S3 extends Component {
    private readonly name: string;
    private readonly bucketName: string;
    private readonly props: Record<string, any>;
    private readonly bucketResourceId: string;

    constructor(stackName: string, name: string, props: Record<string, any> | null) {
        super(stackName);
        this.name = name;
        this.bucketName = this.formatUniqueResourceName(name);
        this.props = props ? props : {};

        this.bucketResourceId = this.formatCloudFormationId(this.name);
    }

    compile(): Record<string, any> {
        const bucket: any = {
            Type: 'AWS::S3::Bucket',
            Properties: {
                BucketName: this.bucketName,
            },
        };

        if (this.props.cors) {
            bucket.Properties.CorsConfiguration = {
                CorsRules: [
                    {
                        AllowedHeaders: ['*'],
                        AllowedMethods: ['GET'],
                        AllowedOrigins: ['*'],
                    },
                ],
            }
        }

        const resources: Record<string, any> = {
            [this.bucketResourceId]: bucket,
        };

        if (this.props.public) {
            resources[this.bucketResourceId + 'BucketPolicy'] = {
                Type: 'AWS::S3::BucketPolicy',
                Properties: {
                    Bucket: this.fnRef(this.bucketResourceId),
                    PolicyDocument: {
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: '*',
                                Action: 's3:GetObject',
                                Resource: this.fnJoin('', [
                                    this.fnGetAtt(this.bucketResourceId, 'Arn'),
                                    '/*',
                                ]),
                            },
                        ],
                    },
                },
            }
        }

        return resources;
    }

    outputs() {
        return {
            [this.bucketResourceId + 'Bucket']: {
                Description: 'Name of the S3 bucket.',
                Value: this.fnRef(this.bucketResourceId),
            },
            [this.bucketResourceId + 'BucketArn']: {
                Description: 'ARN of the S3 bucket.',
                Value: this.fnGetAtt(this.bucketResourceId, 'Arn'),
                Export: {
                    Name: this.stackName + '-' + this.bucketResourceId + 'BucketArn',
                },
            },
        };
    }

    permissions(): PolicyStatement[] {
        const bucketArn = this.fnImportValue(this.stackName + '-' + this.bucketResourceId + 'BucketArn');
        return [
            new PolicyStatement('s3:*', [
                bucketArn,
                this.fnJoin('', [ bucketArn, '/*' ]),
            ]),
        ];
    }

    envVariables() {
        const variableName = this.formatEnvVariableName('BUCKET_' + this.name);
        return {
            [variableName]: this.bucketName,
        };
    }
}
