const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async function(event, context) {
    const bucketname = process.env.BUCKET_NAME;
    console.log(`Using bucket ${bucketname}`);

    const keys = [];
    const response = await s3.listObjectsV2({
        Bucket: bucketname,
    }).promise();
    response.Contents.forEach(obj => keys.push(obj.Key));
    console.log('Found keys:');
    console.log(keys);

    return {
        bucket: bucketname,
        keys: keys,
    };
}
