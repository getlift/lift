import {Component} from "./Component";

export class S3 extends Component {
    private name: string;
    private props: Record<string, any>;

    constructor(name: string, props: Record<string, any> | null) {
        super();
        this.name = name;
        this.props = props ? props : {};
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

        const resourceName = this.formatResourceName(this.name);

        const resources: Record<string, any> = {
            [resourceName]: bucket,
        };

        if (this.props.public) {
            resources[resourceName + 'BucketPolicy'] = {
                Type: 'AWS::S3::BucketPolicy',
                Properties: {
                    Bucket: { Ref: this.name },
                    PolicyDocument: {
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: '*',
                                Action: 's3:GetObject',
                                Resource: {
                                    'Fn::Join': [ '', [ `${this.name}.Arn`, '/*' ] ],
                                },
                            },
                        ],
                    },
                },
            }
        }

        return resources;
    }
}
