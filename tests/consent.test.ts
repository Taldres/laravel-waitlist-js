import { describe, expect, it } from "vitest";
import { ConsentDefinitionError, defineConsent, sha256 } from "../src";

const GERMAN_WORDING =
    "Ja, schreibt mir eine E-Mail, sobald es losgeht. Ich kann mich jederzeit über den Link in jeder E-Mail wieder abmelden.";

const consent = defineConsent(
    "waitlist",
    {
        "2026-09": "Email me when early access opens.",
        "2026-10": {
            en: "Email me when Acme launches.",
            de: "Schreibt mir, wenn Acme startet.",
        },
    },
    { current: "2026-10" },
);

describe("defineConsent", () => {
    it("knows its purpose, versions and the current one", () => {
        expect(consent.purpose).toBe("waitlist");
        expect(consent.current).toBe("2026-10");
        expect(consent.versions).toEqual(["2026-09", "2026-10"]);
    });

    it("tells its versions from anything a form posts", () => {
        expect(consent.isVersion("2026-09")).toBe(true);
        expect(consent.isVersion("2026-11")).toBe(false);
        expect(consent.isVersion("toString")).toBe(false);
        expect(consent.isVersion(undefined)).toBe(false);
    });

    it("chooses a version with one text for every locale", () => {
        expect(consent.choose({ version: "2026-09", locale: "de" })).toEqual({
            waitlist: {
                version: "2026-09",
                text: "Email me when early access opens.",
            },
        });
    });

    it("chooses the current version in the locale shown", () => {
        expect(consent.choose({ locale: "de" })).toEqual({
            waitlist: {
                version: "2026-10",
                locale: "de",
                text: "Schreibt mir, wenn Acme startet.",
            },
        });
        expect(consent.text({ locale: "en" })).toBe(
            "Email me when Acme launches.",
        );
    });

    it("needs a known locale for a version with a text per locale", () => {
        expect(() => consent.choose()).toThrow(
            new ConsentDefinitionError(
                "The version [2026-10] of [waitlist] has a text per locale; choose one.",
            ),
        );
        expect(() => consent.text({ locale: "fr" })).toThrow(
            "The version [2026-10] of [waitlist] has no text in [fr].",
        );
    });

    it("refuses a version it does not have", () => {
        expect(() =>
            consent.choose({ version: "2026-11" as "2026-10", locale: "de" }),
        ).toThrow("The purpose [waitlist] has no version [2026-11].");
    });

    it("chooses with the hash of the text instead", async () => {
        const german = defineConsent(
            "waitlist",
            { "2026-10": GERMAN_WORDING },
            { current: "2026-10" },
        );

        await expect(german.chooseWithHash()).resolves.toEqual({
            waitlist: {
                version: "2026-10",
                hash: "8b60dbbe5b1b8e742e1fdfa038135016880a5e4933e0b63eedc2385b0810a7ff",
            },
        });
        await expect(
            consent.chooseWithHash({ locale: "en" }),
        ).resolves.toMatchObject({
            waitlist: { version: "2026-10", locale: "en" },
        });
    });

    it.each([
        ["", { v1: "Text." }, "v1", "A consent needs a purpose."],
        [
            "waitlist",
            { v1: "Text." },
            "v2",
            "The current version [v2] of [waitlist] has no wording.",
        ],
        [
            "waitlist",
            { v1: " " },
            "v1",
            "The version [v1] of [waitlist] has an empty text.",
        ],
        [
            "waitlist",
            { v1: {} },
            "v1",
            "The version [v1] of [waitlist] has an empty text.",
        ],
        [
            "waitlist",
            { v1: { en: "" } },
            "v1",
            "The version [v1] of [waitlist] has an empty text.",
        ],
    ])("refuses a definition: %j %j", (purpose, wording, current, message) => {
        expect(() =>
            defineConsent(purpose, wording, {
                current: current as never,
            }),
        ).toThrow(new ConsentDefinitionError(message));
    });
});

describe("sha256", () => {
    it("hashes as the API compares wording", async () => {
        await expect(sha256("")).resolves.toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
        await expect(sha256(GERMAN_WORDING)).resolves.toBe(
            "8b60dbbe5b1b8e742e1fdfa038135016880a5e4933e0b63eedc2385b0810a7ff",
        );
    });
});
