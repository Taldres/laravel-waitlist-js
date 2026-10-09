const IPV4 =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Whether `value` is an IPv4 or IPv6 address. */
export function isIpAddress(value: string): boolean {
    if (IPV4.test(value)) {
        return true;
    }

    if (!value.includes(":") || !/^[0-9a-f:.]+$/i.test(value)) {
        return false;
    }

    // The URL parser validates IPv6 in every runtime, Node's `net` only in Node.
    try {
        new URL(`http://[${value}]`);

        return true;
    } catch {
        return false;
    }
}
