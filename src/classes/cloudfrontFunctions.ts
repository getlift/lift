import ServerlessError from "../utils/error";

export function redirectToMainDomain(domains: string[] | undefined): string {
    if (domains === undefined || domains.length < 2) {
        throw new ServerlessError(
            `Invalid value in 'redirectToMainDomain': you must have at least 2 domains configured to enable redirection to the main domain.`,
            "LIFT_INVALID_CONSTRUCT_CONFIGURATION"
        );
    }

    const mainDomain = domains[0];

    return `
    if (request.headers["host"].value !== "${mainDomain}") {
        return {
            statusCode: 301,
            statusDescription: "Moved Permanently",
            headers: {
                location: {
                    value: "https://${mainDomain}" + request.uri
                }
            }
        };
    }`;
}
