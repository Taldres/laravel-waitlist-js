import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(requestHeaders.current),
}));

const { createWaitlistClientFromEnv, defineConsent, visitorIp } =
    await import("../../src/next");

describe("visitorIp", () => {
    it.each([
        [{ "x-real-ip": "203.0.113.7" }, "203.0.113.7"],
        [{ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, "203.0.113.7"],
        [
            { "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" },
            "203.0.113.7",
        ],
        [
            { "x-real-ip": "unknown", "x-forwarded-for": "2001:db8::1" },
            "2001:db8::1",
        ],
        [{ "cf-connecting-ip": "203.0.113.7" }, undefined],
        [{}, undefined],
    ])("reads %j as %j", async (sent, expected) => {
        requestHeaders.current = new Headers(sent);

        await expect(visitorIp()).resolves.toBe(expected);
    });

    it("reads the headers your proxy sets instead", async () => {
        requestHeaders.current = new Headers({
            "x-real-ip": "198.51.100.1",
            "cf-connecting-ip": "203.0.113.7",
        });

        await expect(
            visitorIp({ headers: ["cf-connecting-ip"] }),
        ).resolves.toBe("203.0.113.7");
    });
});

describe("createWaitlistClientFromEnv", () => {
    beforeEach(() => {
        vi.stubEnv("WAITLIST_API_URL", "https://api.example.com/waitlist");
        vi.stubEnv("WAITLIST_API_TOKEN", "env-token");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("reads the environment when a request is made and opts out of the cache", async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(() =>
            Promise.resolve(new Response(null, { status: 202 })),
        );
        const client = createWaitlistClientFromEnv({ fetch });

        vi.stubEnv("WAITLIST_API_TOKEN", "rotated-token");

        await expect(
            client.subscribe({
                email: "jane@example.com",
                purposes: defineConsent(
                    "waitlist",
                    { v1: "Email me." },
                    { current: "v1" },
                ).choose(),
            }),
        ).resolves.toEqual({ status: "accepted" });

        const [input, init] = fetch.mock.calls[0] ?? [];

        expect(input).toBe("https://api.example.com/waitlist");
        expect(init?.cache).toBe("no-store");
        expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer rotated-token",
        );
    });

    it("reads other variables when told to", async () => {
        vi.stubEnv("SHOP_API_URL", "https://other.example.com/waitlist");
        const fetch = vi.fn<typeof globalThis.fetch>(() =>
            Promise.resolve(new Response(null, { status: 202 })),
        );
        const client = createWaitlistClientFromEnv({
            fetch,
            urlVariable: "SHOP_API_URL",
            tokenVariable: "SHOP_API_TOKEN",
        });

        await client.subscribe({ email: "jane@example.com", purposes: {} });

        const [input, init] = fetch.mock.calls[0] ?? [];

        expect(input).toBe("https://other.example.com/waitlist");
        expect(new Headers(init?.headers).has("authorization")).toBe(false);
    });

    it("appends a path to a variable that holds the API's base", async () => {
        vi.stubEnv("WAITLIST_API_URL", "https://api.example.com/api/v1/");
        const fetch = vi.fn<typeof globalThis.fetch>(() =>
            Promise.resolve(new Response(null, { status: 202 })),
        );
        const client = createWaitlistClientFromEnv({
            fetch,
            path: "/waitlist",
        });

        await client.subscribe({ email: "jane@example.com", purposes: {} });

        expect(fetch.mock.calls[0]?.[0]).toBe(
            "https://api.example.com/api/v1/waitlist",
        );
    });

    it("leaves the path out of a missing configuration", async () => {
        vi.stubEnv("WAITLIST_API_URL", "");
        const client = createWaitlistClientFromEnv({
            path: "/waitlist",
            onUnavailable: vi.fn(),
        });

        await expect(client.confirm("token")).resolves.toEqual({
            status: "unavailable",
            reason: "not-configured",
        });
    });

    it("reports a missing configuration instead of failing the build", async () => {
        vi.stubEnv("WAITLIST_API_URL", "");
        const onUnavailable = vi.fn();
        const client = createWaitlistClientFromEnv({ onUnavailable });

        await expect(client.confirm("token")).resolves.toEqual({
            status: "unavailable",
            reason: "not-configured",
        });
    });

    it("uses the global fetch by default", async () => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(null, { status: 202 }));

        await createWaitlistClientFromEnv().subscribe({
            email: "jane@example.com",
            purposes: {},
        });

        expect(fetch).toHaveBeenCalledOnce();
        fetch.mockRestore();
    });
});
