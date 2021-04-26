export const cidrVpc = "10.0.0.0/16";

/**
 * Split in 4 (2 bits), then in 2
 * 10.0.0.0/18 - AZ A
 *     10.0.0.0/19 - Private
 *     10.0.32.0/19 - Public
 * 10.0.64.0/18 - AZ B
 *     10.0.64.0/19 - Private
 *     10.0.96.0/19 - Public
 * 10.0.128.0/18 - AZ C
 *     10.0.128.0/19 - Private
 *     10.0.160.0/19 - Public
 * 10.0.192.0/18 - Spare
 */
export const cidrSubnets = {
    a: {
        Private: "10.0.0.0/19",
        Public: "10.0.32.0/19",
    },
    b: {
        Private: "10.0.64.0/19",
        Public: "10.0.96.0/19",
    },
    c: {
        Private: "10.0.128.0/19",
        Public: "10.0.160.0/19",
    },
};

export function getZoneId(availabilityZone: string): "a" | "b" | "c" {
    const id = availabilityZone.substr(-1, 1);
    if (id !== "a" && id !== "b" && id !== "c") {
        throw new Error(`Availability zone ${id} is not supported (cannot generate CIDR block).`);
    }

    return id;
}
