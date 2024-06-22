import ServerlessError from "../utils/error";

export function redirectToMainDomain(domains: string[] | undefined): string {
    if (domains === undefined) {
        // No custom domains specified
        return "";
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
