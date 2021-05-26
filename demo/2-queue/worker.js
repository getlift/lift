exports.handler = async function(event, context) {
    event.Records.forEach(record => {
        const bodyData = JSON.parse(record.body);
        const fileName = bodyData.fileName;

        // do something with `fileName`
        console.log(`Processing ${fileName}\n`);
        // Let's simulate an error to tests SQS retries and dead letter queue :)
        throw new Error(`Failed to process message ${fileName}`)
    });
}
