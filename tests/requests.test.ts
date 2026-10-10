import { afterEach, describe, expect, it, vi } from "vitest";
import { createWaitlistClient, WaitlistConfigurationError } from "../src";
import { ENTRY, fakeApi, json } from "./helpers";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("requests", () => {
    it("posts a signup as JSON with the token and the visitor's address", async () => {
        const { client, requests } = fakeApi(() => json(202));

        await client.subscribe(
            {
                email: "jane@example.com",
                list: "beta",
                purposes: {
                    waitlist: { version: "2026-10", text: "Email me." },
                },
                metadata: { company: "Acme Inc." },
            },
            { visitorIp: "203.0.113.7" },
        );

        expect(requests).toEqual([
            {
                url: "https://api.example.com/waitlist",
                method: "POST",
                headers: {
                    accept: "application/json",
                    authorization: "Bearer secret-token",
                    "content-type": "application/json",
                    "x-waitlist-client-ip": "203.0.113.7",
                },
                body: {
                    email: "jane@example.com",
                    list: "beta",
                    purposes: {
                        waitlist: { version: "2026-10", text: "Email me." },
                    },
                    metadata: { company: "Acme Inc." },
                },
            },
        ]);
    });

    it("leaves out what the signup does not set", async () => {
        const { client, requests } = fakeApi(() => json(202));

        await client.subscribe({
            email: "jane@example.com",
            purposes: { waitlist: "2026-10" },
        });

        expect(requests[0]?.body).toEqual({
            email: "jane@example.com",
            purposes: { waitlist: "2026-10" },
        });
    });

    it.each([
        ["purposes", () => ["GET", "/purposes?list=beta&locale=de"]],
        ["confirmation", () => ["GET", "/confirm/a%2Fb"]],
        ["confirm", () => ["POST", "/confirm/a%2Fb"]],
        [
            "unsubscribe",
            () => ["POST", "/unsubscribe/a%2Fb?purpose=newsletter"],
        ],
        ["manage", () => ["GET", "/manage/a%2Fb"]],
        ["updatePurposes", () => ["PUT", "/manage/a%2Fb/purposes"]],
        ["leave", () => ["POST", "/manage/a%2Fb/unsubscribe"]],
        ["exportData", () => ["POST", "/manage/a%2Fb/data"]],
        ["erase", () => ["POST", "/manage/a%2Fb/erase"]],
        ["requestManageLink", () => ["POST", "/manage-link"]],
    ] as const)("calls %s on its route", async (operation, expected) => {
        const { client, requests } = fakeApi(() => json(500), {
            url: "https://api.example.com/api/v1/waitlist//",
        });
        const token = "a/b";

        const calls = {
            purposes: () => client.purposes({ list: "beta", locale: "de" }),
            confirmation: () => client.confirmation(token),
            confirm: () => client.confirm(token),
            unsubscribe: () =>
                client.unsubscribe(token, { purpose: "newsletter" }),
            manage: () => client.manage(token),
            updatePurposes: () =>
                client.updatePurposes(token, { waitlist: "2026-10" }),
            leave: () => client.leave(token),
            exportData: () => client.exportData(token),
            erase: () => client.erase(token),
            requestManageLink: () =>
                client.requestManageLink({ email: "jane@example.com" }),
        };

        await calls[operation]();

        const [method, path] = expected();

        expect(requests[0]?.method).toBe(method);
        expect(requests[0]?.url).toBe(
            `https://api.example.com/api/v1/waitlist${path}`,
        );
    });

    it("sends the bodies the routes expect", async () => {
        const { client, requests } = fakeApi(() => json(500));

        await client.updatePurposes("token", { waitlist: "2026-10" });
        await client.erase("token");
        await client.requestManageLink({ token: "unsubscribe-token" });
        await client.confirm("token");

        expect(requests.map((request) => request.body)).toEqual([
            { purposes: { waitlist: "2026-10" } },
            { confirm: true },
            { token: "unsubscribe-token" },
            undefined,
        ]);
        expect(requests[3]?.headers["content-type"]).toBeUndefined();
    });

    it("asks for the purposes without a query when none is given", async () => {
        const { client, requests } = fakeApi(() => json(500));

        await client.purposes();

        expect(requests[0]?.url).toBe(
            "https://api.example.com/waitlist/purposes",
        );
    });

    it("sends no token when none is configured", async () => {
        const { client, requests } = fakeApi(() => json(202), {
            token: undefined,
        });

        await client.subscribe({ email: "jane@example.com", purposes: {} });

        expect(requests[0]?.headers.authorization).toBeUndefined();
    });

    it.each(["", "unknown", "300.1.1.1", "<script>"])(
        "sends no visitor header for %j",
        async (visitorIp) => {
            const { client, requests } = fakeApi(() => json(202));

            await client.subscribe(
                { email: "jane@example.com", purposes: {} },
                { visitorIp },
            );

            expect(
                requests[0]?.headers["x-waitlist-client-ip"],
            ).toBeUndefined();
        },
    );

    it("forwards the visitor in the header the API names", async () => {
        const { client, requests } = fakeApi(() => json(202), {
            clientIpHeader: "X-Visitor",
        });

        await client.confirm("token", { visitorIp: "2001:db8::1" });

        expect(requests[0]?.headers["x-visitor"]).toBe("2001:db8::1");
    });

    it("reads the URL and the token when a request is made", async () => {
        const settings: { url?: string; token?: string } = {};
        const { client, requests, onUnavailable } = fakeApi(() => json(202), {
            url: () => settings.url,
            token: () => settings.token,
        });

        const first = await client.subscribe({
            email: "jane@example.com",
            purposes: {},
        });

        settings.url = "https://late.example.com/waitlist";
        settings.token = "late-token";

        await client.subscribe({ email: "jane@example.com", purposes: {} });

        expect(first).toEqual({
            status: "unavailable",
            reason: "not-configured",
        });
        expect(onUnavailable).toHaveBeenCalledWith({
            operation: "subscribe",
            reason: "not-configured",
        });
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe("https://late.example.com/waitlist");
        expect(requests[0]?.headers.authorization).toBe("Bearer late-token");
    });

    it("treats an empty URL as missing", async () => {
        const { client, fetch } = fakeApi(() => json(202), { url: "" });

        await expect(
            client.subscribe({ email: "jane@example.com", purposes: {} }),
        ).resolves.toEqual({ status: "unavailable", reason: "not-configured" });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("uses the global fetch when none is given", async () => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(json(202));
        const client = createWaitlistClient({
            url: "https://api.example.com/waitlist",
        });

        await expect(
            client.subscribe({ email: "jane@example.com", purposes: {} }),
        ).resolves.toEqual({ status: "accepted" });
        expect(fetch).toHaveBeenCalledOnce();
    });

    it("does not follow redirects", async () => {
        const { client, fetch } = fakeApi(() => json(202));

        await client.subscribe({ email: "jane@example.com", purposes: {} });

        expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("manual");
    });
});

describe("headers and credentials", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sends the client's headers, then the request's, under the client's own", async () => {
        const { client, requests } = fakeApi(() => json(202), {
            headers: {
                "X-XSRF-TOKEN": "from-the-client",
                Accept: "text/html",
                Authorization: "Basic overridden",
            },
        });

        await client.subscribe(
            { email: "jane@example.com", purposes: {} },
            {
                visitorIp: "203.0.113.7",
                headers: {
                    "X-XSRF-TOKEN": "from-the-request",
                    "X-Challenge": "solved",
                    "X-Waitlist-Client-Ip": "198.51.100.1",
                },
            },
        );

        expect(requests[0]?.headers).toEqual({
            accept: "application/json",
            authorization: "Bearer secret-token",
            "content-type": "application/json",
            "x-challenge": "solved",
            "x-waitlist-client-ip": "203.0.113.7",
            "x-xsrf-token": "from-the-request",
        });
    });

    it("asks a function for the headers of each request", async () => {
        const { client, requests } = fakeApi(() => json(404, {}), {
            headers: (operation) =>
                operation === "subscribe"
                    ? { "X-Challenge": "solved" }
                    : undefined,
        });

        await client.subscribe({ email: "jane@example.com", purposes: {} });
        await client.confirm("token");

        expect(requests[0]?.headers).toHaveProperty("x-challenge", "solved");
        expect(requests[1]?.headers).not.toHaveProperty("x-challenge");
    });

    it("leaves an Authorization header alone without a token", async () => {
        const { client, requests } = fakeApi(() => json(202), {
            token: undefined,
            headers: { Authorization: "Custom scheme" },
        });

        await client.subscribe({ email: "jane@example.com", purposes: {} });

        expect(requests[0]?.headers).toHaveProperty(
            "authorization",
            "Custom scheme",
        );
    });

    it("passes credentials on to fetch, and nothing by default", async () => {
        const withCookies = fakeApi(() => json(202), {
            credentials: "include",
        });
        const plain = fakeApi(() => json(202));

        await withCookies.client.subscribe({
            email: "jane@example.com",
            purposes: {},
        });
        await plain.client.subscribe({
            email: "jane@example.com",
            purposes: {},
        });

        expect(withCookies.fetch.mock.calls[0]?.[1]?.credentials).toBe(
            "include",
        );
        expect(plain.fetch.mock.calls[0]?.[1]).not.toHaveProperty(
            "credentials",
        );
    });

    it("refuses a token in a browser, where it would be anyone's", () => {
        vi.stubGlobal("window", {});
        vi.stubGlobal("document", {});

        expect(() =>
            createWaitlistClient({
                url: "https://api.example.com/waitlist",
                token: "secret-token",
            }),
        ).toThrow(WaitlistConfigurationError);
        expect(() =>
            createWaitlistClient({ url: "https://api.example.com/waitlist" }),
        ).not.toThrow();
    });
});

describe("failures", () => {
    it("reports a network error", async () => {
        const { client, onUnavailable } = fakeApi(() => {
            throw new TypeError("fetch failed");
        });

        await expect(client.confirm("token")).resolves.toEqual({
            status: "unavailable",
            reason: "network",
        });
        expect(onUnavailable).toHaveBeenCalledWith({
            operation: "confirm",
            reason: "network",
        });
    });

    it("reports the code behind a network error, but not in the result", async () => {
        const { client, onUnavailable } = fakeApi(() => {
            throw new TypeError("fetch failed", {
                cause: Object.assign(new Error("connect ECONNREFUSED"), {
                    code: "ECONNREFUSED",
                }),
            });
        });

        await expect(client.confirm("token")).resolves.toEqual({
            status: "unavailable",
            reason: "network",
        });
        expect(onUnavailable).toHaveBeenCalledWith({
            operation: "confirm",
            reason: "network",
            code: "ECONNREFUSED",
        });
    });

    it.each([
        ["a code that is not code-shaped", { code: "connect 10.0.0.1:443" }],
        ["a code that is not a string", { code: 111 }],
        ["a cause without a code", "socket hang up"],
    ])("leaves out %s", async (_case, cause) => {
        const { client, onUnavailable } = fakeApi(() => {
            throw new TypeError("fetch failed", { cause });
        });

        await client.confirm("token");

        expect(onUnavailable.mock.calls[0]?.[0]).toStrictEqual({
            operation: "confirm",
            reason: "network",
        });
    });

    it("reports a rejection that is not an error", async () => {
        const rejection: unknown = "connection refused";
        const { client, onUnavailable } = fakeApi(() => {
            throw rejection;
        });

        await expect(client.confirm("token")).resolves.toEqual({
            status: "unavailable",
            reason: "network",
        });
        expect(onUnavailable.mock.calls[0]?.[0]).toStrictEqual({
            operation: "confirm",
            reason: "network",
        });
    });

    it("gives up after the timeout", async () => {
        const { client } = fakeApi(
            () =>
                new Promise<Response>((_, reject) => {
                    setTimeout(() => {
                        reject(new DOMException("timed out", "TimeoutError"));
                    }, 50);
                }),
            { timeout: 10 },
        );

        await expect(client.manage("token")).resolves.toEqual({
            status: "unavailable",
            reason: "timeout",
        });
    });

    it("aborts the request once the timeout passes", async () => {
        const fetch = vi.fn(
            (_input: RequestInfo | URL, init?: RequestInit) =>
                new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener("abort", () => {
                        reject(init.signal?.reason as Error);
                    });
                }),
        );
        const client = createWaitlistClient({
            url: "https://api.example.com/waitlist",
            fetch,
            timeout: 5,
            onUnavailable: () => undefined,
        });

        await expect(client.manage("token")).resolves.toEqual({
            status: "unavailable",
            reason: "timeout",
        });
    });

    it("tells an abort by the caller from a timeout", async () => {
        const controller = new AbortController();
        const { client } = fakeApi(
            () =>
                new Promise<Response>((_, reject) => {
                    controller.signal.addEventListener("abort", () => {
                        reject(new DOMException("aborted", "AbortError"));
                    });
                }),
        );

        const result = client.manage("token", { signal: controller.signal });
        controller.abort();

        await expect(result).resolves.toEqual({
            status: "unavailable",
            reason: "aborted",
        });
    });

    it.each([500, 401, 403, 302])("reports an HTTP %i", async (code) => {
        const { client, onUnavailable } = fakeApi(() => json(code));

        await expect(
            client.subscribe({ email: "jane@example.com", purposes: {} }),
        ).resolves.toEqual({ status: "unavailable", reason: `http-${code}` });
        expect(onUnavailable).toHaveBeenCalledWith({
            operation: "subscribe",
            reason: `http-${code}`,
        });
    });

    it("logs to the console without the token by default", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {
            /* silenced */
        });
        const client = createWaitlistClient({
            url: "https://api.example.com/waitlist",
            token: "secret-token",
            fetch: () => Promise.resolve(json(500)),
        });

        await client.subscribe({ email: "jane@example.com", purposes: {} });

        expect(error).toHaveBeenCalledWith(
            "[laravel-waitlist] subscribe unavailable: http-500",
        );
        expect(JSON.stringify(error.mock.calls)).not.toContain("secret-token");
        expect(JSON.stringify(error.mock.calls)).not.toContain("jane@");
    });

    it("logs the code behind a network error by default", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {
            /* silenced */
        });
        const client = createWaitlistClient({
            url: "https://api.example.com/waitlist",
            fetch: () =>
                Promise.reject(
                    new TypeError("fetch failed", {
                        cause: { code: "ENOTFOUND" },
                    }),
                ),
        });

        await client.confirm("token");

        expect(error).toHaveBeenCalledWith(
            "[laravel-waitlist] confirm unavailable: network (ENOTFOUND)",
        );
    });

    it("tolerates a body that is not JSON", async () => {
        const { client } = fakeApi(
            () =>
                new Response("<html>Service Unavailable</html>", {
                    status: 503,
                }),
        );

        await expect(client.erase("token")).resolves.toEqual({
            status: "unavailable",
            reason: "http-503",
        });
    });

    it("keeps the entry of a token route from an unexpected body", async () => {
        const { client } = fakeApi(() =>
            json(200, { data: { ...ENTRY, status: "deleted" } }),
        );

        await expect(client.confirm("token")).resolves.toEqual({
            status: "unavailable",
            reason: "invalid-response",
        });
    });
});
