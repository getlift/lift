import {Component} from "./Component";
import {PolicyStatement} from "../utils/cloudformation";

export class S3 extends Component {
    private stackName: string;
    private bucketName: string;
    private props: Record<string, any>;
    private bucketResourceName: string;

    constructor(stackName: string, name: string, props: Record<string, any> | null) {
        super();
        this.stackName = stackName;
        this.bucketName = name;
        this.props = props ? props : {};

        this.bucketResourceName = this.formatResourceName(this.bucketName);
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
            [this.bucketResourceName]: bucket,
        };

        if (this.props.public) {
            resources[this.bucketResourceName + 'BucketPolicy'] = {
                Type: 'AWS::S3::BucketPolicy',
                Properties: {
                    Bucket: this.fnRef(this.bucketResourceName),
                    PolicyDocument: {
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: '*',
                                Action: 's3:GetObject',
                                Resource: this.fnJoin('', [
                                    this.fnGetAtt(this.bucketResourceName, 'Arn'),
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
            [this.bucketResourceName + 'Bucket']: {
                Description: 'Name of the S3 bucket.',
                Value: this.fnRef(this.bucketResourceName),
            },
            [this.bucketResourceName + 'BucketArn']: {
                Description: 'ARN of the S3 bucket.',
                Value: this.fnGetAtt(this.bucketResourceName, 'Arn'),
                Export: {
                    Name: this.stackName + '-' + this.bucketResourceName + 'BucketArn',
                },
            },
        };
    }

    permissions(): PolicyStatement[] {
        const bucketArn = this.fnImportValue(this.stackName + '-' + this.bucketResourceName + 'BucketArn');
        return [
            new PolicyStatement('s3:*', [
                bucketArn,
                this.fnJoin('', [ bucketArn, '/*' ]),
            ]),
        ];
    }

    envVariables() {
        const variableName = this.formatEnvVariableName('BUCKET_' + this.bucketName);
        return {
            [variableName]: this.bucketName,
        };
    }
}
