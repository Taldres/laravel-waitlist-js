import { describe, expect, it } from "vitest";
import { isIpAddress } from "../src";

describe("isIpAddress", () => {
    it.each([
        "203.0.113.7",
        "0.0.0.0",
        "255.255.255.255",
        "2001:db8::1",
        "::1",
        "::ffff:203.0.113.7",
        "fe80::1ff:fe23:4567:890a",
    ])("accepts %s", (value) => {
        expect(isIpAddress(value)).toBe(true);
    });

    it.each([
        "",
        "localhost",
        "256.1.1.1",
        "01.2.3.4",
        "1.2.3",
        "1.2.3.4.5",
        "2001:db8::1::2",
        "2001:db8::zz",
        "[::1]",
        "::1]/x[",
        "203.0.113.7, 10.0.0.1",
    ])("refuses %j", (value) => {
        expect(isIpAddress(value)).toBe(false);
    });
});
