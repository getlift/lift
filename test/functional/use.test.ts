import * as assert from 'assert';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {runCommand} from '../../src/tests/helper';
import sinon from 'sinon';
import * as CloudFormation from '../../src/aws/CloudFormation';

afterEach(() => {
    sinon.restore();
});

describe('lift deploy with use', () => {

    beforeEach(() => {
        let yamlString = fs.readFileSync(__dirname + '/use/lift-used.yml').toString();
        const config = yaml.safeLoad(yamlString) as Record<string, any>;
        sinon.stub(CloudFormation, 'getMetadata').resolves({
            'Lift::Template': JSON.stringify(config),
            'Lift::Version': '1',
        });

        sinon.stub(CloudFormation, 'getOutputs').resolves({
            VpcId: 'vpc-123',
            AppSecurityGroupId: 'sg-123',
            SubnetPrivateUsEast1aId: 'subnet-123',
            SubnetPrivateUsEast1bId: 'subnet-234',
            SubnetPrivateUsEast1cId: 'subnet-345',
            DatabaseName: 'dbname',
            DatabaseHost: 'dbname.e2sctvp0nqos.us-east-1.rds.amazonaws.com',
            DatabasePort: '3306',
            AvatarsBucketArn: 'arn:aws:s3:::app-avatars',
        });
    })

    it('should use the VPC', async function() {
        const output = await runCommand(__dirname + '/use', 'vpc');
        assert.deepStrictEqual(JSON.parse(output), {
            securityGroupIds: [
                "sg-123"
            ],
            subnetIds: [
                "subnet-123",
                "subnet-234",
                "subnet-345"
            ]
        });
    });

    it('should use variables', async function() {
        const output = await runCommand(__dirname + '/use', 'variables');
        assert.deepStrictEqual(JSON.parse(output), {
            BUCKET_AVATARS: 'stack-db-avatars',
            DATABASE_HOST: 'dbname.e2sctvp0nqos.us-east-1.rds.amazonaws.com',
            DATABASE_NAME: 'dbname',
            DATABASE_PORT: '3306',
        });
    });

    it('should use permissions', async function() {
        const output = await runCommand(__dirname + '/use', 'permissions');
        assert.deepStrictEqual(JSON.parse(output), [
            {
                Effect: 'Allow',
                Action: 's3:*',
                Resource: [
                    'arn:aws:s3:::app-avatars',
                    'arn:aws:s3:::app-avatars/*',
                ],
            },
        ]);
    });

})
