import { describe, expectTypeOf, it } from "vitest";
import {
    createWaitlistClient,
    defineConsent,
    type ConflictReason,
    type ManagePurposeChoices,
    type PurposeChoices,
    type Operation,
    type PurposeUnsubscriptionResult,
    type SubscribeResult,
    type UnavailableReason,
    type UnsubscribeResult,
    type UnsubscriptionResult,
    type UpdatePurposesResult,
    type WaitlistEntry,
    type WithdrawResult,
} from "../src";

describe("types", () => {
    it("keeps the versions of a consent", () => {
        const consent = defineConsent(
            "waitlist",
            { "2026-09": "Old.", "2026-10": "New." },
            { current: "2026-10" },
        );

        expectTypeOf(consent.current).toEqualTypeOf<"2026-09" | "2026-10">();
        expectTypeOf(consent.choose()).toEqualTypeOf<PurposeChoices>();

        // @ts-expect-error: not a version of this consent
        consent.choose({ version: "2026-11" });

        const posted: unknown = "2026-09";

        if (consent.isVersion(posted)) {
            expectTypeOf(posted).toEqualTypeOf<"2026-09" | "2026-10">();
        }
    });

    it("refuses a current version without wording", () => {
        defineConsent(
            "waitlist",
            { "2026-10": "New." },
            // @ts-expect-error: no wording for this version
            { current: "2026-11" },
        );
    });

    it("narrows results by status", async () => {
        const client = createWaitlistClient({ url: "https://example.com" });
        const confirmed = await client.confirm("token");

        if (confirmed.status === "confirmed") {
            expectTypeOf(confirmed.entry).toEqualTypeOf<WaitlistEntry>();
        }

        if (confirmed.status === "unavailable") {
            expectTypeOf(confirmed.reason).toEqualTypeOf<UnavailableReason>();
        }

        expectTypeOf<SubscribeResult["status"]>().toEqualTypeOf<
            "accepted" | "invalid" | "rate_limited" | "unavailable"
        >();
    });

    it("tells a headers function which operation it is for", () => {
        createWaitlistClient({
            url: "https://example.com",
            headers: (operation) => {
                expectTypeOf(operation).toEqualTypeOf<Operation>();

                return undefined;
            },
        });
    });

    it("expects a refusal from unsubscribe only for a purpose", async () => {
        const client = createWaitlistClient({ url: "https://example.com" });

        expectTypeOf(
            await client.unsubscribe("token"),
        ).toEqualTypeOf<UnsubscribeResult>();
        expectTypeOf(
            await client.unsubscribe("token", { visitorIp: "203.0.113.7" }),
        ).toEqualTypeOf<UnsubscribeResult>();
        expectTypeOf(
            await client.unsubscribe("token", { purpose: "newsletter" }),
        ).toEqualTypeOf<WithdrawResult>();

        const withdraw = (purpose: string | undefined) =>
            client.unsubscribe("token", { purpose });

        expectTypeOf(await withdraw(undefined)).toEqualTypeOf<WithdrawResult>();
        expectTypeOf<UnsubscribeResult["status"]>().toEqualTypeOf<
            "unsubscribed" | "not_found" | "rate_limited" | "unavailable"
        >();
        expectTypeOf<WithdrawResult["status"]>().toEqualTypeOf<
            | "unsubscribed"
            | "not_found"
            | "invalid"
            | "rate_limited"
            | "unavailable"
        >();
    });

    it("expects a refusal from an unsubscription only for a purpose", async () => {
        const client = createWaitlistClient({ url: "https://example.com" });

        expectTypeOf(
            await client.unsubscription("token"),
        ).toEqualTypeOf<UnsubscriptionResult>();
        expectTypeOf(
            await client.unsubscription("token", {
                visitorIp: "203.0.113.7",
            }),
        ).toEqualTypeOf<UnsubscriptionResult>();
        expectTypeOf(
            await client.unsubscription("token", { purpose: "newsletter" }),
        ).toEqualTypeOf<PurposeUnsubscriptionResult>();

        const ask = (purpose: string | undefined) =>
            client.unsubscription("token", { purpose });

        expectTypeOf(
            await ask(undefined),
        ).toEqualTypeOf<PurposeUnsubscriptionResult>();
        expectTypeOf<UnsubscriptionResult["status"]>().toEqualTypeOf<
            "ok" | "not_found" | "rate_limited" | "unavailable"
        >();
        expectTypeOf<PurposeUnsubscriptionResult["status"]>().toEqualTypeOf<
            "ok" | "not_found" | "invalid" | "rate_limited" | "unavailable"
        >();
    });

    it("names why a purposes update conflicts", async () => {
        const client = createWaitlistClient({ url: "https://example.com" });
        const updated = await client.updatePurposes("token", {
            waitlist: "2026-10",
        });

        if (updated.status === "conflict") {
            expectTypeOf(updated.reason).toEqualTypeOf<ConflictReason | null>();
        }

        expectTypeOf<ConflictReason>().toEqualTypeOf<
            "not_subscribed" | "list_unavailable"
        >();
        expectTypeOf<UpdatePurposesResult["status"]>().toEqualTypeOf<
            | "updated"
            | "invalid"
            | "conflict"
            | "not_found"
            | "expired"
            | "rate_limited"
            | "unavailable"
        >();
    });

    it("takes no wording on the preference page", async () => {
        const client = createWaitlistClient({ url: "https://example.com" });
        const consent = defineConsent(
            "newsletter",
            { "2026-10": "Also send me the newsletter." },
            { current: "2026-10" },
        );
        const hashed = "a".repeat(64);

        await client.updatePurposes("token", { newsletter: "2026-10" });
        await client.updatePurposes("token", {
            newsletter: { version: "2026-10", locale: "de", hash: hashed },
        });
        await client.updatePurposes("token", await consent.chooseWithHash());

        await client.updatePurposes("token", {
            // @ts-expect-error: wording is only for a signup from the project's servers
            newsletter: { version: "2026-10", text: "Reworded." },
        });
        // @ts-expect-error: choose() carries the text shown
        await client.updatePurposes("token", consent.choose());

        expectTypeOf<ManagePurposeChoices>().toExtend<PurposeChoices>();
        expectTypeOf(
            await consent.chooseWithHash(),
        ).toEqualTypeOf<ManagePurposeChoices>();

        await client.subscribe({
            email: "jane@example.com",
            purposes: {
                newsletter: { version: "2026-10", text: "Also send me." },
            },
        });
    });
});
