import { describe, expectTypeOf, it } from "vitest";
import {
    createWaitlistClient,
    defineConsent,
    type PurposeChoices,
    type Operation,
    type SubscribeResult,
    type UnavailableReason,
    type UnsubscribeResult,
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
});
