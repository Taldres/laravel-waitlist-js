import { describe, expect, it } from "vitest";
import type { WaitlistClient } from "../src";
import { ENTRY, fakeApi, INVALID_TOKEN, json, PARSED_ENTRY } from "./helpers";

type Call = (client: WaitlistClient) => Promise<unknown>;

const subscribe: Call = (client) =>
    client.subscribe({ email: "jane@example.com", purposes: {} });
const purposes: Call = (client) => client.purposes({ list: "beta" });
const manageLink: Call = (client) =>
    client.requestManageLink({ email: "jane@example.com", list: "beta" });
const confirmation: Call = (client) => client.confirmation("token");
const confirm: Call = (client) => client.confirm("token");
const unsubscription: Call = (client) => client.unsubscription("token");
const unsubscriptionOfPurpose: Call = (client) =>
    client.unsubscription("token", { purpose: "newsletter" });
const unsubscribe: Call = (client) => client.unsubscribe("token");
const withdraw: Call = (client) =>
    client.unsubscribe("token", { purpose: "newsletter" });
const manage: Call = (client) => client.manage("token");
const updatePurposes: Call = (client) =>
    client.updatePurposes("token", { waitlist: "2026-10" });
const leave: Call = (client) => client.leave("token");
const exportData: Call = (client) => client.exportData("token");
const erase: Call = (client) => client.erase("token");

const VALIDATION = {
    message: "The email field must be a valid email address.",
    errors: { email: ["The email field must be a valid email address."] },
};

const WORDING = {
    purpose: "waitlist",
    version: "2026-10",
    locale: null,
    text: "Email me when early access opens.",
    hash: "a".repeat(64),
    required: true,
};

describe.each([
    ["subscribe", subscribe, 202, undefined, { status: "accepted" }],
    [
        "subscribe",
        subscribe,
        422,
        VALIDATION,
        { status: "invalid", ...VALIDATION },
    ],
    [
        "subscribe",
        subscribe,
        422,
        { message: "Spam check failed." },
        { status: "invalid", message: "Spam check failed.", errors: {} },
    ],
    [
        "subscribe",
        subscribe,
        422,
        { message: "Spam check failed.", error: "spam_check_failed" },
        {
            status: "invalid",
            message: "Spam check failed.",
            errors: {},
            reason: "spam_check_failed",
        },
    ],
    [
        "subscribe",
        subscribe,
        422,
        { message: "No.", error: "something_else" },
        { status: "invalid", message: "No.", errors: {} },
    ],
    [
        "purposes",
        purposes,
        200,
        { data: [WORDING] },
        { status: "ok", purposes: [WORDING] },
    ],
    ["purposes", purposes, 200, { data: [] }, { status: "ok", purposes: [] }],
    [
        "purposes",
        purposes,
        404,
        { message: "Not found.", error: "unknown_list" },
        { status: "not_found" },
    ],
    [
        "requestManageLink",
        manageLink,
        202,
        { message: "Requested." },
        { status: "requested" },
    ],
    [
        "requestManageLink",
        manageLink,
        422,
        VALIDATION,
        { status: "invalid", ...VALIDATION },
    ],
    [
        "confirmation",
        confirmation,
        200,
        { data: ENTRY },
        { status: "ok", entry: PARSED_ENTRY },
    ],
    [
        "confirmation",
        confirmation,
        200,
        { data: { ...ENTRY, status: "pending", confirmed_at: null } },
        {
            status: "ok",
            entry: { ...PARSED_ENTRY, status: "pending", confirmedAt: null },
        },
    ],
    ["confirmation", confirmation, 404, INVALID_TOKEN, { status: "not_found" }],
    ["confirmation", confirmation, 410, undefined, { status: "expired" }],
    [
        "confirm",
        confirm,
        200,
        { data: ENTRY },
        { status: "confirmed", entry: PARSED_ENTRY },
    ],
    ["confirm", confirm, 404, INVALID_TOKEN, { status: "not_found" }],
    ["confirm", confirm, 410, undefined, { status: "expired" }],
    [
        "unsubscription",
        unsubscription,
        200,
        { data: ENTRY },
        { status: "ok", entry: PARSED_ENTRY },
    ],
    [
        "unsubscription",
        unsubscription,
        404,
        INVALID_TOKEN,
        { status: "not_found" },
    ],
    [
        "unsubscription",
        unsubscriptionOfPurpose,
        200,
        { data: ENTRY },
        { status: "ok", entry: PARSED_ENTRY },
    ],
    [
        "unsubscription",
        unsubscriptionOfPurpose,
        404,
        INVALID_TOKEN,
        { status: "not_found" },
    ],
    [
        "unsubscription",
        unsubscriptionOfPurpose,
        422,
        { message: "The purpose must be a purpose name." },
        {
            status: "invalid",
            message: "The purpose must be a purpose name.",
            errors: {},
        },
    ],
    [
        "unsubscribe",
        unsubscribe,
        200,
        { data: ENTRY },
        { status: "unsubscribed", entry: PARSED_ENTRY },
    ],
    ["unsubscribe", unsubscribe, 404, INVALID_TOKEN, { status: "not_found" }],
    [
        "unsubscribe",
        withdraw,
        422,
        { message: "The purpose must be a purpose name." },
        {
            status: "invalid",
            message: "The purpose must be a purpose name.",
            errors: {},
        },
    ],
    [
        "manage",
        manage,
        200,
        { data: ENTRY },
        { status: "ok", entry: PARSED_ENTRY },
    ],
    ["manage", manage, 404, INVALID_TOKEN, { status: "not_found" }],
    ["manage", manage, 410, undefined, { status: "expired" }],
    [
        "updatePurposes",
        updatePurposes,
        200,
        { data: ENTRY },
        { status: "updated", entry: PARSED_ENTRY },
    ],
    [
        "updatePurposes",
        updatePurposes,
        409,
        { message: "Not subscribed.", error: "not_subscribed" },
        {
            status: "conflict",
            message: "Not subscribed.",
            reason: "not_subscribed",
        },
    ],
    [
        "updatePurposes",
        updatePurposes,
        409,
        {
            message: "This list is no longer available.",
            error: "list_unavailable",
        },
        {
            status: "conflict",
            message: "This list is no longer available.",
            reason: "list_unavailable",
        },
    ],
    [
        "updatePurposes",
        updatePurposes,
        409,
        { message: "Conflict.", error: "something_new" },
        { status: "conflict", message: "Conflict.", reason: null },
    ],
    [
        "updatePurposes",
        updatePurposes,
        409,
        { message: "Not subscribed." },
        { status: "conflict", message: "Not subscribed.", reason: null },
    ],
    [
        "updatePurposes",
        updatePurposes,
        409,
        undefined,
        { status: "conflict", message: null, reason: null },
    ],
    [
        "updatePurposes",
        updatePurposes,
        422,
        VALIDATION,
        { status: "invalid", ...VALIDATION },
    ],
    [
        "updatePurposes",
        updatePurposes,
        404,
        INVALID_TOKEN,
        { status: "not_found" },
    ],
    ["updatePurposes", updatePurposes, 410, undefined, { status: "expired" }],
    [
        "leave",
        leave,
        200,
        { data: ENTRY },
        { status: "unsubscribed", entry: PARSED_ENTRY },
    ],
    ["leave", leave, 404, INVALID_TOKEN, { status: "not_found" }],
    ["leave", leave, 410, undefined, { status: "expired" }],
    [
        "exportData",
        exportData,
        200,
        { email: "jane@example.com", subscriptions: [] },
        {
            status: "ok",
            data: { email: "jane@example.com", subscriptions: [] },
        },
    ],
    ["exportData", exportData, 404, INVALID_TOKEN, { status: "not_found" }],
    ["exportData", exportData, 410, undefined, { status: "expired" }],
    ["erase", erase, 200, { message: "Erased." }, { status: "erased" }],
    ["erase", erase, 404, INVALID_TOKEN, { status: "not_found" }],
    ["erase", erase, 410, undefined, { status: "expired" }],
] as const)("%s answering %i", (_operation, call, code, body, expected) => {
    it(`resolves to ${expected.status}`, async () => {
        const { client, onUnavailable } = fakeApi(() => json(code, body));

        await expect(call(client)).resolves.toEqual(expected);
        expect(onUnavailable).not.toHaveBeenCalled();
    });
});

describe.each([
    ["subscribe", subscribe],
    ["purposes", purposes],
    ["requestManageLink", manageLink],
    ["confirmation", confirmation],
    ["confirm", confirm],
    ["unsubscription", unsubscription],
    ["unsubscription", unsubscriptionOfPurpose],
    ["unsubscribe", unsubscribe],
    ["manage", manage],
    ["updatePurposes", updatePurposes],
    ["leave", leave],
    ["exportData", exportData],
    ["erase", erase],
] as const)("%s", (operation, call) => {
    it("reports when the API limits the rate, with the wait it asks for", async () => {
        const { client } = fakeApi(() =>
            json(
                429,
                { message: "Too Many Attempts." },
                { "Retry-After": "30" },
            ),
        );

        await expect(call(client)).resolves.toEqual({
            status: "rate_limited",
            retryAfter: 30,
        });
    });

    it("reports a request that got no answer", async () => {
        const { client, onUnavailable } = fakeApi(() => {
            throw new TypeError("fetch failed");
        });

        await expect(call(client)).resolves.toEqual({
            status: "unavailable",
            reason: "network",
        });
        expect(onUnavailable).toHaveBeenCalledWith({
            operation,
            reason: "network",
        });
    });

    it("reports a 404 the API does not name, such as one for a missing route", async () => {
        const { client, onUnavailable } = fakeApi(() =>
            json(404, { message: "Not Found" }),
        );

        await expect(call(client)).resolves.toEqual({
            status: "unavailable",
            reason: "http-404",
        });
        expect(onUnavailable).toHaveBeenCalledWith({
            operation,
            reason: "http-404",
        });
    });

    it("reports an answer it has no branch for", async () => {
        const { client, onUnavailable } = fakeApi(() => json(418));

        await expect(call(client)).resolves.toEqual({
            status: "unavailable",
            reason: "http-418",
        });
        expect(onUnavailable).toHaveBeenCalledWith({
            operation,
            reason: "http-418",
        });
    });
});

describe("unsubscription", () => {
    it("has no branch for a refusal when it asks about no purpose", async () => {
        const { client, requests, onUnavailable } = fakeApi(() =>
            json(422, { message: "The purpose must be a purpose name." }),
        );

        await expect(unsubscription(client)).resolves.toEqual({
            status: "unavailable",
            reason: "http-422",
        });
        expect(requests[0]?.url).toBe(
            "https://api.example.com/waitlist/unsubscribe/token",
        );
        expect(onUnavailable).toHaveBeenCalledWith({
            operation: "unsubscription",
            reason: "http-422",
        });
    });
});

describe("unsubscribe", () => {
    it("has no branch for a refusal when it withdraws no purpose", async () => {
        const { client, requests, onUnavailable } = fakeApi(() =>
            json(422, { message: "The purpose must be a purpose name." }),
        );

        await expect(unsubscribe(client)).resolves.toEqual({
            status: "unavailable",
            reason: "http-422",
        });
        expect(requests[0]?.url).toBe(
            "https://api.example.com/waitlist/unsubscribe/token",
        );
        expect(onUnavailable).toHaveBeenCalledWith({
            operation: "unsubscribe",
            reason: "http-422",
        });
    });
});

describe("rate limits", () => {
    it.each([undefined, "soon", "Wed, 21 Oct 2026 07:28:00 GMT"])(
        "leaves the wait open for Retry-After %j",
        async (retryAfter) => {
            const { client } = fakeApi(() =>
                json(
                    429,
                    undefined,
                    retryAfter === undefined
                        ? {}
                        : { "Retry-After": retryAfter },
                ),
            );

            await expect(subscribe(client)).resolves.toEqual({
                status: "rate_limited",
                retryAfter: null,
            });
        },
    );
});

describe("bodies that do not fit", () => {
    it.each([
        ["confirm", confirm, { data: { ...ENTRY, purposes: [1] } }],
        ["confirm", confirm, { data: { ...ENTRY, confirmed_at: 5 } }],
        ["confirm", confirm, { data: null }],
        ["confirm", confirm, []],
        // A confirm link answers 404 for a person who has left.
        [
            "confirmation",
            confirmation,
            { data: { ...ENTRY, status: "unsubscribed" } },
        ],
        ["unsubscription", unsubscription, { data: { ...ENTRY, list: 5 } }],
        ["manage", manage, { data: { ...ENTRY, created_at: null } }],
        ["purposes", purposes, { data: [{ ...WORDING, required: "yes" }] }],
        ["purposes", purposes, { data: {} }],
        ["purposes", purposes, null],
        ["exportData", exportData, ["not", "an", "object"]],
    ] as const)("%s refuses %j", async (operation, call, body) => {
        const { client, onUnavailable } = fakeApi(() => json(200, body));

        await expect(call(client)).resolves.toEqual({
            status: "unavailable",
            reason: "invalid-response",
        });
        expect(onUnavailable).toHaveBeenCalledWith({
            operation,
            reason: "invalid-response",
        });
    });

    it("keeps the messages of validation errors and drops the rest", async () => {
        const { client } = fakeApi(() =>
            json(422, {
                message: 42,
                errors: { email: ["Invalid.", 7], list: "not a list" },
            }),
        );

        await expect(subscribe(client)).resolves.toEqual({
            status: "invalid",
            message: null,
            errors: { email: ["Invalid."] },
        });
    });

    it("reads a validation answer without errors", async () => {
        const { client } = fakeApi(() => json(422, "Unprocessable"));

        await expect(subscribe(client)).resolves.toEqual({
            status: "invalid",
            message: null,
            errors: {},
        });
    });
});
