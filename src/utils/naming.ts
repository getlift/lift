import crypto from "crypto";

export function ensureNameMaxLength(name: string, maxLength: number): string {
    if (name.length <= maxLength) {
        return name;
    }

    const uniqueSuffix = crypto.createHash("md5").update(name).digest("hex").slice(0, 6);

    return name.slice(0, maxLength - uniqueSuffix.length - 1) + "-" + uniqueSuffix;
}
