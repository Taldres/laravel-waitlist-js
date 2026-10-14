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
    options: { list?: string; newsletter?: boolean; visitorIp?: string } = {},
): Promise<Tokens & { email: string }> {
    const email = `contract-${String(Date.now())}-${String(++addresses)}@example.com`;
    const result = await server.subscribe(
        {
            email,
            list: options.list ?? "beta",
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

async function confirmed(
    options: { list?: string; newsletter?: boolean } = {},
) {
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

/**
 * A challenge the API issued `minutes` ago. A request handled in the past
 * leaves no rate limit behind; one handled in the future would block the
 * signup route for as long.
 */
async function challengeIssued(minutes: number): Promise<string> {
    const { client } = connect({
        token: undefined,
        headers: { "X-Form-Check": "passed" },
        ...later(-minutes),
    });
    const result = await client.purposes({ list: "beta" });

    if (result.status !== "ok" || result.challenge === null) {
        throw new Error("The API hands out no challenge.");
    }

    return result.challenge;
}

/** Runs `waitlist:prune` as if `days` from now had passed, as the scheduler would. */
async function pruneAfter(days: number): Promise<void> {
    const response = await fetch(`${API}/contract/prune`, {
        method: "POST",
        headers: {
            "X-Contract-Now": new Date(
                Date.now() + days * 86_400_000,
            ).toISOString(),
        },
    });

    expect(response.ok).toBe(true);
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
    answerBy: null,
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
            challenge: expect.any(String) as unknown,
        });
    });

    it("answers not_found for a list the project does not have", async () => {
        expect(await server.purposes({ list: "nope" })).toEqual({
            status: "not_found",
        });
    });
});

describe("count", () => {
    it("answers null for a list with fewer than ten people", async () => {
        expect(await server.count({ list: "quiet" })).toEqual({
            status: "ok",
            list: "quiet",
            count: null,
        });
    });

    it("rounds the confirmed down to a multiple of ten", async () => {
        for (let person = 0; person < 10; person++) {
            await confirmed({ list: "queue" });
        }

        const result = await server.count({ list: "queue" });

        expect(result).toEqual({
            status: "ok",
            list: "queue",
            count: expect.any(Number) as unknown,
        });
        expect(result.status === "ok" ? (result.count ?? 0) % 10 : -1).toBe(0);
        expect(
            result.status === "ok" ? result.count : 0,
        ).toBeGreaterThanOrEqual(10);
    });

    it("lets a guest read it, too", async () => {
        expect(await guest.count({ list: "quiet" })).toEqual({
            status: "ok",
            list: "quiet",
            count: null,
        });
    });

    it("answers count_disabled for a list that does not publish it", async () => {
        expect(await server.count({ list: "teams" })).toEqual({
            status: "count_disabled",
        });
        expect(await server.count({ list: "beta" })).toEqual({
            status: "count_disabled",
        });
    });

    it("answers not_found for a list the project does not have", async () => {
        expect(await server.count({ list: "nope" })).toEqual({
            status: "not_found",
        });
    });

    it("answers invalid for a list name no signup could post", async () => {
        expect(await server.count({ list: "a b" })).toEqual({
            status: "invalid",
            message: expect.any(String) as unknown,
            errors: { list: [expect.any(String) as unknown] },
        });
    });
});

describe("position", () => {
    it("is null until the address confirmed, then the place in line", async () => {
        const first = await signUp();
        const second = await signUp();

        expect(await server.position(first.unsubscribe ?? "")).toEqual({
            status: "ok",
            project: "default",
            list: "beta",
            entryStatus: "pending",
            position: null,
        });

        await server.confirm(first.confirm ?? "");
        await server.confirm(second.confirm ?? "");

        const ahead = await server.position(first.unsubscribe ?? "");
        const behind = await server.position(second.unsubscribe ?? "");

        expect(ahead).toEqual({
            status: "ok",
            project: "default",
            list: "beta",
            entryStatus: "confirmed",
            position: expect.any(Number) as unknown,
        });
        expect(
            ahead.status === "ok" && behind.status === "ok"
                ? (behind.position ?? 0) - (ahead.position ?? 0)
                : 0,
        ).toBe(1);
    });

    it("answers position_disabled for a list that does not publish it", async () => {
        const { unsubscribe = "" } = await confirmed({ list: "queue" });

        expect(await server.position(unsubscribe)).toEqual({
            status: "position_disabled",
        });
    });

    it("answers not_found for an unknown token", async () => {
        expect(await server.position("unknown")).toEqual({
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

describe("a project without manage links", () => {
    const { client: plain, failures } = connect({
        token: undefined,
        headers: { ...PASSING_HEADERS, "X-Contract-Project": "plain" },
    });

    it("answers a request by address with its own status, the same for every address", async () => {
        expect(
            await plain.requestManageLink({ email: "anyone@example.com" }),
        ).toEqual({ status: "manage_links_disabled" });
        expect(
            await plain.requestManageLink({
                email: "someone-else@example.com",
                list: "beta",
            }),
        ).toEqual({ status: "manage_links_disabled" });
        expect(failures).toEqual([]);
    });

    it("answers a request by the unsubscribe token the same way", async () => {
        const email = `plain-${String(Date.now())}@example.com`;

        expect(
            await plain.subscribe({
                email,
                list: "beta",
                purposes: { waitlist: "2026-10" },
            }),
        ).toEqual({ status: "accepted" });

        const { unsubscribe } = await tokensOf(email);

        expect(
            await plain.requestManageLink({ token: unsubscribe ?? "" }),
        ).toEqual({ status: "manage_links_disabled" });
        expect(await plain.requestManageLink({ email })).toEqual({
            status: "manage_links_disabled",
        });
        expect(await plain.requestManageLink({ token: "made-up" })).toEqual({
            status: "requested",
        });
        expect(failures).toEqual([]);
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
            reason: "spam_check_failed",
        });
        expect(await client.requestManageLink({ email })).toEqual({
            status: "invalid",
            message: "Spam check failed.",
            errors: {},
            reason: "spam_check_failed",
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
        const solved = { challenge: "passed" };

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

describe("the challenge from the wording", () => {
    const { client: visitor } = connect({
        token: undefined,
        headers: { "X-Form-Check": "passed" },
    });
    const signup = () => ({
        email: `visitor-${String(Date.now())}-${String(++addresses)}@example.com`,
        list: "beta",
        purposes: { waitlist: "2026-10" },
    });
    const refused = {
        status: "invalid",
        message: "Spam check failed.",
        errors: {},
        reason: "spam_check_failed",
    };

    it("lets a visitor sign up with it once a person would have filled in the form", async () => {
        const challenge = await challengeIssued(1);

        expect(await visitor.subscribe(signup(), { challenge })).toEqual({
            status: "accepted",
        });
    });

    it("refuses a signup without it", async () => {
        expect(await visitor.subscribe(signup())).toEqual(refused);
    });

    it("refuses a signup that comes back at once", async () => {
        const challenge = await challengeIssued(0);

        expect(await visitor.subscribe(signup(), { challenge })).toEqual(
            refused,
        );
    });

    it("refuses a signup that comes back after an hour", async () => {
        const challenge = await challengeIssued(61);

        expect(await visitor.subscribe(signup(), { challenge })).toEqual(
            refused,
        );
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

describe("asking a confirmed address again", () => {
    it("shows the deadline until the token is posted back", async () => {
        const { email } = await confirmed();

        await pruneAfter(31);

        const { confirm = "" } = await tokensOf(email);

        expect(await server.confirmation(confirm)).toEqual({
            status: "ok",
            entry: {
                ...entry("confirmed", ["waitlist"]),
                answerBy: timestamp,
            },
        });
        expect(await server.confirm(confirm)).toEqual({
            status: "confirmed",
            entry: entry("confirmed", ["waitlist"]),
        });
        expect(await server.confirmation(confirm)).toEqual({
            status: "ok",
            entry: entry("confirmed", ["waitlist"]),
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
});
