"use strict";

const fs = require('fs');
const AWS = require('aws-sdk');
const ec2 = new AWS.EC2({
    region: 'us-east-1',
});

async function listAZ() {
    const list = await ec2.describeRegions().promise().then(async (regions) => {
        const promises = regions.Regions.map(async (region, index) => {
            const ec2 = new AWS.EC2({
                region: region.RegionName
            });

            return ec2.describeAvailabilityZones().promise().then(zones => {
                return {
                    region: region.RegionName,
                    zones: zones.AvailabilityZones.map((a) => a.ZoneName)
                };
            });
        })

        return Promise.all(promises);
    });

    const output = {};
    list.map(item => {
        output[item.region] = item.zones;
    });
    return output;
}

(async () => {
    try {
        const az = await listAZ();
        console.log(az);
        fs.writeFileSync(__dirname + '/../zones.json', JSON.stringify(az, undefined, 2));
    } catch (e) {
        console.error(e);
    }
})();
