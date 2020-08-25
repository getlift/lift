import chalk from "chalk";
import {StackEvent} from "aws-sdk/clients/cloudformation";

export async function displayCloudFormationEvents(events: Array<StackEvent>) {
    for (const event of events.reverse()) {
        const status = event.ResourceStatus ? event.ResourceStatus : '';
        const prefix = event.Timestamp.toLocaleTimeString();

        let displayDetails = false;
        let output = chalk`{gray [${prefix}]} `;
        if (status.includes('FAILED') || status === 'ROLLBACK_COMPLETE') {
            output += chalk`{red ${status}}`;
            displayDetails = true;
        } else if (status.includes('COMPLETE')) {
            output += chalk`{green ${status}}`;
        } else {
            output += status;
        }

        console.log(chalk`${output}\t${event.LogicalResourceId} {gray (${event.ResourceType})}`);
        if (displayDetails && event.ResourceStatusReason) {
            console.log(chalk`\t{red ${event.ResourceStatusReason}}`);
        }
    }
}

