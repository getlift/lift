exports.hello = async function(event, context) {
    return process.env.BUCKET_NAME;
}
