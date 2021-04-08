import {Component} from "./Component";
import {PolicyStatement, Stack} from '../Stack';

export class S3 extends Component {
    private readonly name: string;
    private readonly bucketName: string;
    private readonly props: Record<string, any>;
    private readonly bucketResourceId: string;

    constructor(stack: Stack, name: string, props: Record<string, any> | null) {
        super(stack);
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
            },
        };
    }

    async permissionsReferences() {
        return [
            new PolicyStatement('s3:*', [
                this.fnGetAtt(this.bucketResourceId, 'Arn'),
                this.fnSub(`$\{${this.bucketResourceId}.Arn}/*`),
            ]),
        ];
    }

    async envVariables() {
        const variableName = this.formatEnvVariableName('BUCKET_' + this.name);
        return {
            [variableName]: this.bucketName,
        };
    }

    async envVariablesReferences() {
        const variableName = this.formatEnvVariableName('BUCKET_' + this.name);
        return {
            [variableName]: this.bucketName,
        };
    }
}
