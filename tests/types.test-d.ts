import { describe, expectTypeOf, it } from "vitest";
import {
    createWaitlistClient,
    defineConsent,
    type PurposeChoices,
    type SubscribeResult,
    type UnavailableReason,
    type WaitlistEntry,
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
});
