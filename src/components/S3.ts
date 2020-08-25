import {Component} from "./Component";

export class S3 extends Component {
    private name: string;
    private props: Record<string, any>;
    private bucketResourceName: string;

    constructor(name: string, props: Record<string, any> | null) {
        super();
        this.name = name;
        this.props = props ? props : {};

        this.bucketResourceName = this.formatResourceName(this.name);
    }

    compile(): Record<string, any> {
        const bucket: any = {
            Type: 'AWS::S3::Bucket',
            Properties: {
                BucketName: this.name,
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
        };
    }
}
