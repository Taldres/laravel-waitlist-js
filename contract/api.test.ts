import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createWaitlistClient,
    createWaitlistClientFromEnv,
    defineConsent,
    sha256,
    type ManagePurposeChoices,
    type UnavailableFailure,
    type WaitlistClientOptions,
} from "../src/next";

vi.mock("server-only", () => ({}));
vi.mock("next/headers.js", () => ({
    headers: () => Promise.resolve(new Headers()),
}));

const API = process.env.CONTRACT_API_URL ?? "http://127.0.0.1:8000";

const waitlist = defineConsent(
    "waitlist",
    { "2026-10": "Email me when early access opens." },
    { current: "2026-10" },
);

const newsletter = defineConsent(
    "newsletter",
    { "2026-10": "Also send me the newsletter." },
    { current: "2026-10" },
);

const PASSING_HEADERS = {
    "X-Form-Check": "passed",
    "X-Waitlist-Challenge": "passed",
};

interface Tokens {
    confirm?: string;
    unsubscribe?: string;
    manage?: string;
}

function connect(options: Partial<WaitlistClientOptions> = {}) {
    const failures: UnavailableFailure[] = [];
    const client = createWaitlistClient({
        url: `${API}/waitlist`,
        token: "contract-token",
        headers: PASSING_HEADERS,
        onUnavailable: (failure) => failures.push(failure),
        ...options,
    });

    return { client, failures };
}

/** Requests the API handles as if made `minutes` from now. */
function later(minutes: number): Partial<WaitlistClientOptions> {
    const now = new Date(Date.now() + minutes * 60_000).toISOString();

    return {
        fetch: (input, init) => {
            const headers = new Headers(init?.headers);

            headers.set("X-Contract-Now", now);

            return fetch(input, { ...init, headers });
        },
    };
}

const { client: server } = connect();
const { client: guest } = connect({ token: undefined });

let addresses = 0;

async function tokensOf(email: string): Promise<Tokens> {
    const response = await fetch(
        `${API}/contract/tokens/${encodeURIComponent(email)}`,
    );

    return (await response.json()) as Tokens;
}

async function signUp(
    options: { newsletter?: boolean; visitorIp?: string } = {},
): Promise<Tokens & { email: string }> {
    const email = `contract-${String(Date.now())}-${String(++addresses)}@example.com`;
    const result = await server.subscribe(
        {
            email,
            list: "beta",
            purposes: {
                ...waitlist.choose(),
                ...(options.newsletter === true ? newsletter.choose() : {}),
            },
        },
        { visitorIp: options.visitorIp },
    );

    expect(result).toEqual({ status: "accepted" });

    return { email, ...(await tokensOf(email)) };
}

async function confirmed(options: { newsletter?: boolean } = {}) {
    const person = await signUp(options);

    await server.confirm(person.confirm ?? "");

    return person;
}

async function withManageToken(person: Tokens & { email: string }) {
    expect(
        await server.requestManageLink({ token: person.unsubscribe ?? "" }),
    ).toEqual({ status: "requested" });

    return (await tokensOf(person.email)).manage ?? "";
}

const timestamp = expect.any(String) as unknown;

const entry = (status: string, purposes: string[]) => ({
    project: "default",
    list: "beta",
    status,
    purposes,
    confirmedAt: status === "pending" ? null : timestamp,
    unsubscribedAt: status === "unsubscribed" ? timestamp : null,
    createdAt: timestamp,
});

describe("purposes", () => {
    it("serves the wording a signup registered, hashed as the client hashes it", async () => {
        await signUp({ newsletter: true });

        expect(await server.purposes({ list: "beta" })).toEqual({
            status: "ok",
            purposes: expect.arrayContaining([
                {
                    purpose: "waitlist",
                    version: "2026-10",
                    locale: null,
                    text: waitlist.text(),
                    hash: await sha256(waitlist.text()),
                    required: true,
                },
                {
                    purpose: "newsletter",
                    version: "2026-10",
                    locale: null,
                    text: newsletter.text(),
                    hash: await sha256(newsletter.text()),
                    required: false,
                },
            ]) as unknown,
        });
    });

    it("answers not_found for a list the project does not have", async () => {
        expect(await server.purposes({ list: "nope" })).toEqual({
            status: "not_found",
        });
    });
});

describe("subscribe", () => {
    const email = () => `subscribe-${String(Date.now())}@example.com`;

    it("accepts the hash of the wording shown once it is registered", async () => {
        await signUp();

        expect(
            await server.subscribe({
                email: email(),
                list: "beta",
                purposes: await waitlist.chooseWithHash(),
            }),
        ).toEqual({ status: "accepted" });
    });

    it("accepts a guest sending only the version", async () => {
        await signUp();

        expect(
            await guest.subscribe({
                email: email(),
                list: "beta",
                purposes: { waitlist: "2026-10" },
            }),
        ).toEqual({ status: "accepted" });
    });

    it("refuses wording from a guest", async () => {
        const { client, failures } = connect({ token: undefined });

        expect(
            await client.subscribe({
                email: email(),
                list: "beta",
                purposes: waitlist.choose(),
            }),
        ).toEqual({ status: "unavailable", reason: "http-403" });
        expect(failures).toEqual([
            { operation: "subscribe", reason: "http-403" },
        ]);
    });

    it.each([
        ["email", { email: "not-an-address" }],
        ["metadata", { metadata: { company: "Initech" } }],
        ["metadata.company", { list: "teams", metadata: {} }],
        ["list", { list: "" }],
        [
            "purposes",
            {
                purposes: {
                    waitlist: { version: "2026-10", text: "Reworded." },
                },
            },
        ],
    ])("names the field when %s is refused", async (field, input) => {
        await signUp();

        const result = await server.subscribe({
            email: email(),
            list: "beta",
            purposes: waitlist.choose(),
            ...input,
        });

        expect(result).toMatchObject({
            status: "invalid",
            message: expect.any(String) as unknown,
        });
        expect(result.status === "invalid" && result.errors).toHaveProperty([
            field,
        ]);
    });

    it("forwards the visitor's address for the API to record", async () => {
        const person = await signUp({ visitorIp: "203.0.113.7" });
        const manage = await withManageToken(person);
        const exported = await server.exportData(manage);

        expect(JSON.stringify(exported)).toContain("203.0.113.7");
    });
});

describe("requestManageLink", () => {
    it("mails a link for an unsubscribe token or an address", async () => {
        const person = await signUp();

        expect(await withManageToken(person)).not.toBe("");
        expect(
            await server.requestManageLink({
                email: person.email,
                list: "beta",
            }),
        ).toEqual({ status: "requested" });
    });

    it("names the field when the address is refused", async () => {
        expect(
            await server.requestManageLink({ email: "not-an-address" }),
        ).toMatchObject({
            status: "invalid",
            errors: { email: expect.any(Array) as unknown },
        });
    });
});

describe("the spam check", () => {
    const challenged = { "X-Form-Check": "passed" };

    it("refuses a signup and a manage link by address without the challenge", async () => {
        const { client, failures } = connect({ headers: challenged });
        const { email } = await signUp();

        expect(
            await client.subscribe({
                email: `spam-${String(Date.now())}@example.com`,
                list: "beta",
                purposes: waitlist.choose(),
            }),
        ).toEqual({
            status: "invalid",
            message: "Spam check failed.",
            errors: {},
        });
        expect(await client.requestManageLink({ email })).toEqual({
            status: "invalid",
            message: "Spam check failed.",
            errors: {},
        });
        expect(failures).toEqual([]);
    });

    it("mails a manage link requested by token without the check meant for forms", async () => {
        const { client, failures } = connect({ headers: {} });
        const { unsubscribe = "" } = await signUp();

        expect(await client.requestManageLink({ token: unsubscribe })).toEqual({
            status: "requested",
        });
        expect(failures).toEqual([]);
    });

    it("accepts both once the request carries the challenge", async () => {
        const { client } = connect({ headers: challenged });
        const { email } = await signUp();
        const solved = { headers: { "X-Waitlist-Challenge": "passed" } };

        expect(
            await client.subscribe(
                {
                    email: `spam-${String(Date.now())}@example.com`,
                    list: "beta",
                    purposes: waitlist.choose(),
                },
                solved,
            ),
        ).toEqual({ status: "accepted" });
        expect(await client.requestManageLink({ email }, solved)).toEqual({
            status: "requested",
        });
    });
});

describe("a server of another project", () => {
    it("is kept from the project's lists with a 404 that names no error", async () => {
        const { client, failures } = connect({ token: "foreign-token" });

        expect(
            await client.subscribe({
                email: `foreign-${String(Date.now())}@example.com`,
                list: "beta",
                purposes: waitlist.choose(),
            }),
        ).toEqual({ status: "unavailable", reason: "http-404" });
        expect(await client.purposes({ list: "beta" })).toEqual({
            status: "unavailable",
            reason: "http-404",
        });
        expect(
            await client.requestManageLink({
                email: "foreign@example.com",
                list: "beta",
            }),
        ).toEqual({ status: "unavailable", reason: "http-404" });
        expect(failures).toEqual([
            { operation: "subscribe", reason: "http-404" },
            { operation: "purposes", reason: "http-404" },
            { operation: "requestManageLink", reason: "http-404" },
        ]);
    });

    it("still gets the answers of the token routes", async () => {
        const { client } = connect({ token: "foreign-token" });

        expect(await client.confirm("unknown")).toEqual({
            status: "not_found",
        });
    });
});

describe("confirm", () => {
    it("reports the state, then confirms, and again on a repeat", async () => {
        const { confirm = "" } = await signUp();

        expect(await server.confirmation(confirm)).toEqual({
            status: "ok",
            // Nothing is in force before the confirmation.
            entry: entry("pending", []),
        });
        expect(await server.confirm(confirm)).toEqual({
            status: "confirmed",
            entry: entry("confirmed", ["waitlist"]),
        });
        expect(await server.confirm(confirm)).toEqual({
            status: "confirmed",
            entry: entry("confirmed", ["waitlist"]),
        });
    });

    it("answers not_found for an unknown token and expired for an old one", async () => {
        const { confirm = "" } = await signUp();
        const { client: weekLater } = connect(later(8 * 24 * 60));

        expect(await server.confirmation("unknown")).toEqual({
            status: "not_found",
        });
        expect(await server.confirm("unknown")).toEqual({
            status: "not_found",
        });
        expect(await weekLater.confirmation(confirm)).toEqual({
            status: "expired",
        });
        expect(await weekLater.confirm(confirm)).toEqual({
            status: "expired",
        });
    });
});

describe("unsubscribe", () => {
    it("withdraws one purpose, then leaves the list, and again on a repeat", async () => {
        const { unsubscribe = "" } = await confirmed({ newsletter: true });

        expect(
            await server.unsubscribe(unsubscribe, { purpose: "newsletter" }),
        ).toEqual({
            status: "unsubscribed",
            entry: entry("confirmed", ["waitlist"]),
        });
        expect(await server.unsubscribe(unsubscribe)).toEqual({
            status: "unsubscribed",
            entry: entry("unsubscribed", []),
        });
        expect(await server.unsubscribe(unsubscribe)).toEqual({
            status: "unsubscribed",
            entry: entry("unsubscribed", []),
        });
    });

    it("reports the state of the link without acting on it", async () => {
        const { unsubscribe = "" } = await confirmed({ newsletter: true });
        const both = entry("confirmed", ["waitlist", "newsletter"]);

        expect(await server.unsubscription(unsubscribe)).toEqual({
            status: "ok",
            entry: both,
        });
        expect(
            await server.unsubscription(unsubscribe, { purpose: "newsletter" }),
        ).toEqual({ status: "ok", entry: both });
        expect(await server.unsubscription(unsubscribe)).toEqual({
            status: "ok",
            entry: both,
        });

        await server.unsubscribe(unsubscribe);

        expect(await server.unsubscription(unsubscribe)).toEqual({
            status: "ok",
            entry: entry("unsubscribed", []),
        });
    });

    it("refuses an empty purpose when asking about a link, too", async () => {
        const { unsubscribe = "" } = await confirmed();

        expect(
            await server.unsubscription(unsubscribe, { purpose: "" }),
        ).toEqual({
            status: "invalid",
            message: "The purpose must be a purpose name.",
            errors: {},
        });
        expect(await server.unsubscription("unknown")).toEqual({
            status: "not_found",
        });
    });

    it("refuses an empty purpose and answers not_found for an unknown token", async () => {
        const { unsubscribe = "" } = await confirmed();

        expect(
            await server.unsubscribe(unsubscribe, { purpose: "" }),
        ).toMatchObject({ status: "invalid" });
        expect(await server.unsubscribe("unknown")).toEqual({
            status: "not_found",
        });
    });
});

describe("the preference page", () => {
    it("shows the entry and updates its purposes", async () => {
        const manage = await withManageToken(await confirmed());

        expect(await server.manage(manage)).toEqual({
            status: "ok",
            entry: entry("confirmed", ["waitlist"]),
        });
        expect(
            await server.updatePurposes(manage, {
                waitlist: "2026-10",
                newsletter: "2026-10",
            }),
        ).toEqual({
            status: "updated",
            entry: entry("confirmed", ["waitlist", "newsletter"]),
        });
        expect(
            await server.updatePurposes(manage, { newsletter: "2026-10" }),
        ).toMatchObject({
            status: "invalid",
            errors: { purposes: expect.any(Array) as unknown },
        });
    });

    it("takes the hash of the wording shown, but never the wording", async () => {
        const manage = await withManageToken(
            await confirmed({ newsletter: true }),
        );

        expect(
            await server.updatePurposes(manage, {
                ...waitlist.choose(),
                ...(await newsletter.chooseWithHash()),
            } as unknown as ManagePurposeChoices),
        ).toMatchObject({
            status: "invalid",
            errors: { "purposes.waitlist": expect.any(Array) as unknown },
        });
        expect(
            await server.updatePurposes(manage, {
                ...(await waitlist.chooseWithHash()),
                ...(await newsletter.chooseWithHash()),
            }),
        ).toEqual({
            status: "updated",
            entry: entry("confirmed", ["waitlist", "newsletter"]),
        });
    });

    it("exports the data, leaves, refuses to change a left entry and erases", async () => {
        const person = await confirmed();
        const manage = await withManageToken(person);
        const exported = await server.exportData(manage);

        expect(exported).toMatchObject({
            status: "ok",
            data: { email: person.email },
        });
        expect(await server.leave(manage)).toEqual({
            status: "unsubscribed",
            entry: entry("unsubscribed", []),
        });
        expect(
            await server.updatePurposes(manage, { waitlist: "2026-10" }),
        ).toEqual({
            status: "conflict",
            message: expect.any(String) as unknown,
            reason: "not_subscribed",
        });
        expect(await server.erase(manage)).toEqual({ status: "erased" });
        expect(await server.manage(manage)).toEqual({ status: "not_found" });
    });

    it("answers not_found for an unknown token on every route", async () => {
        expect(await server.manage("unknown")).toEqual({ status: "not_found" });
        expect(
            await server.updatePurposes("unknown", { waitlist: "2026-10" }),
        ).toEqual({ status: "not_found" });
        expect(await server.leave("unknown")).toEqual({ status: "not_found" });
        expect(await server.exportData("unknown")).toEqual({
            status: "not_found",
        });
        expect(await server.erase("unknown")).toEqual({ status: "not_found" });
    });

    it("answers expired on every route once the link is old", async () => {
        const manage = await withManageToken(await confirmed());
        const { client: hourLater } = connect(later(61));

        expect(await hourLater.manage(manage)).toEqual({ status: "expired" });
        expect(
            await hourLater.updatePurposes(manage, { waitlist: "2026-10" }),
        ).toEqual({ status: "expired" });
        expect(await hourLater.leave(manage)).toEqual({ status: "expired" });
        expect(await hourLater.exportData(manage)).toEqual({
            status: "expired",
        });
        expect(await hourLater.erase(manage)).toEqual({ status: "expired" });
    });
});

describe("failures", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("passes on the rate limit with the wait Laravel asks for", async () => {
        const token = `rate-limited-${String(Date.now())}`;

        await server.confirm(token);
        await server.confirm(token);

        expect(await server.confirm(token)).toEqual({
            status: "rate_limited",
            retryAfter: expect.any(Number) as unknown,
        });
    });

    it("sends what the signup's own middleware checks, which the token links skip", async () => {
        const { client, failures } = connect({ headers: undefined });
        const { client: perRequest } = connect({ headers: undefined });

        expect(
            await client.subscribe({
                email: `form-check-${String(Date.now())}@example.com`,
                list: "beta",
                purposes: waitlist.choose(),
            }),
        ).toEqual({ status: "unavailable", reason: "http-419" });
        expect(failures).toEqual([
            { operation: "subscribe", reason: "http-419" },
        ]);
        expect(
            await perRequest.subscribe(
                {
                    email: `form-check-${String(Date.now())}@example.com`,
                    list: "beta",
                    purposes: waitlist.choose(),
                },
                { headers: PASSING_HEADERS },
            ),
        ).toEqual({ status: "accepted" });
        expect(await client.confirm("unknown")).toEqual({
            status: "not_found",
        });
    });

    it("reports a URL without the routes' prefix instead of an invalid link", async () => {
        const { client, failures } = connect({ url: API });

        expect(await client.confirm("unknown")).toEqual({
            status: "unavailable",
            reason: "http-404",
        });
        expect(await client.purposes({ list: "beta" })).toEqual({
            status: "unavailable",
            reason: "http-404",
        });
        expect(failures).toEqual([
            { operation: "confirm", reason: "http-404" },
            { operation: "purposes", reason: "http-404" },
        ]);
    });

    it("reaches the routes through the environment and a path", async () => {
        vi.stubEnv("WAITLIST_API_URL", API);
        vi.stubEnv("WAITLIST_API_TOKEN", "contract-token");

        const client = createWaitlistClientFromEnv({ path: "/waitlist" });

        expect(await client.confirm("unknown")).toEqual({
            status: "not_found",
        });
    });
});

describe("the websites a project lists", () => {
    const site = "https://site.example";
    const fromSite = { ...PASSING_HEADERS, Origin: site };

    it("lets a listed website sign up, and refuses another with a 403", async () => {
        // The project takes its wording from servers, so one registers it first. A guest then sends only
        // the version; a server with a token calls for its project and is not checked.
        await connect().client.subscribe({
            email: `register-${String(Date.now())}@example.com`,
            list: "beta",
            purposes: waitlist.choose(),
        });

        const listed = connect({ token: undefined, headers: fromSite });
        const foreign = connect({
            token: undefined,
            headers: { ...PASSING_HEADERS, Origin: "https://evil.example" },
        });

        expect(
            await listed.client.subscribe({
                email: `listed-${String(Date.now())}@example.com`,
                list: "beta",
                purposes: { waitlist: "2026-10" },
            }),
        ).toEqual({ status: "accepted" });
        expect(
            await foreign.client.subscribe({
                email: `foreign-${String(Date.now())}@example.com`,
                list: "beta",
                purposes: { waitlist: "2026-10" },
            }),
        ).toEqual({ status: "unavailable", reason: "http-403" });
        expect(foreign.failures).toEqual([
            { operation: "subscribe", reason: "http-403" },
        ]);
    });

    it("answers the preflight request of a listed website, and of no other", async () => {
        const preflight = (origin: string) =>
            fetch(`${API}/waitlist`, {
                method: "OPTIONS",
                headers: {
                    Origin: origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers":
                        "content-type,x-waitlist-challenge",
                },
            });

        const listed = await preflight(site);
        const foreign = await preflight("https://evil.example");

        // With one origin listed, the header always names it: a browser on another website still cannot read the answer.
        expect(listed.headers.get("access-control-allow-origin")).toBe(site);
        expect(foreign.headers.get("access-control-allow-origin")).not.toBe(
            "https://evil.example",
        );
    });

    it("lets a browser read how long to wait after a 429", async () => {
        const { client } = connect({ token: undefined, headers: fromSite });
        const token = `rate-limited-${String(Date.now())}`;

        await client.confirmation(token);
        await client.confirmation(token);
        const response = await fetch(`${API}/waitlist/confirm/${token}`, {
            headers: { Origin: site },
        });

        expect(response.status).toBe(429);
        expect(response.headers.get("access-control-allow-origin")).toBe(site);
        expect(response.headers.get("access-control-expose-headers")).toContain(
            "Retry-After",
        );
    });
});
