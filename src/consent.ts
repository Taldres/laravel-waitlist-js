import type { ManagePurposeChoices, PurposeChoices } from "./types";

/** One text for every locale, or a text per locale. */
export type ConsentWording = string | Readonly<Record<string, string>>;

export interface ConsentChoiceOptions<Version extends string> {
    /** Defaults to the current version. */
    version?: Version | undefined;
    /** Required for a version with a text per locale. */
    locale?: string | undefined;
}

export interface Consent<Version extends string> {
    readonly purpose: string;
    readonly current: Version;
    readonly versions: readonly Version[];
    /** Narrows a value posted by a form, e.g. a hidden field. */
    isVersion(value: unknown): value is Version;
    text(options?: ConsentChoiceOptions<Version>): string;
    /** The choice with the text shown, for a project that takes wording from its servers. */
    choose(options?: ConsentChoiceOptions<Version>): PurposeChoices;
    /** The choice with the hash of the text shown, for a project that keeps the wording itself. */
    chooseWithHash(
        options?: ConsentChoiceOptions<Version>,
    ): Promise<ManagePurposeChoices>;
}

export class ConsentDefinitionError extends Error {
    override name = "ConsentDefinitionError";
}

/**
 * The wording of one purpose, versioned, where the site shows it. Never reword a
 * version: add a new one and make it current.
 */
export function defineConsent<
    const Wording extends Readonly<Record<string, ConsentWording>>,
>(
    purpose: string,
    wording: Wording,
    options: { current: Extract<keyof Wording, string> },
): Consent<Extract<keyof Wording, string>> {
    type Version = Extract<keyof Wording, string>;

    const versions = Object.keys(wording) as Version[];

    assertDefinition(purpose, wording, options.current);

    const isVersion = (value: unknown): value is Version =>
        typeof value === "string" && Object.hasOwn(wording, value);

    const resolve = (choice: ConsentChoiceOptions<Version> = {}) => {
        const version = choice.version ?? options.current;
        const texts: ConsentWording | undefined = isVersion(version)
            ? wording[version]
            : undefined;

        if (texts === undefined) {
            throw new ConsentDefinitionError(
                `The purpose [${purpose}] has no version [${version}].`,
            );
        }

        if (typeof texts === "string") {
            return { version, text: texts, locale: undefined };
        }

        const text =
            choice.locale === undefined ? undefined : texts[choice.locale];

        if (text === undefined) {
            throw new ConsentDefinitionError(
                choice.locale === undefined
                    ? `The version [${version}] of [${purpose}] has a text per locale; choose one.`
                    : `The version [${version}] of [${purpose}] has no text in [${choice.locale}].`,
            );
        }

        return { version, text, locale: choice.locale };
    };

    return {
        purpose,
        current: options.current,
        versions,
        isVersion,
        text: (choice) => resolve(choice).text,
        choose: (choice) => {
            const { version, text, locale } = resolve(choice);

            return { [purpose]: { version, locale, text } };
        },
        chooseWithHash: async (choice) => {
            const { version, text, locale } = resolve(choice);

            return { [purpose]: { version, locale, hash: await sha256(text) } };
        },
    };
}

/** SHA-256 as lowercase hex, as the API compares wording. */
export async function sha256(text: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
    );

    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}

function assertDefinition(
    purpose: string,
    wording: Readonly<Record<string, ConsentWording>>,
    current: string,
): void {
    if (purpose === "") {
        throw new ConsentDefinitionError("A consent needs a purpose.");
    }

    if (!Object.hasOwn(wording, current)) {
        throw new ConsentDefinitionError(
            `The current version [${current}] of [${purpose}] has no wording.`,
        );
    }

    for (const [version, texts] of Object.entries(wording)) {
        const values =
            typeof texts === "string" ? [texts] : Object.values(texts);

        if (values.length === 0 || values.some((text) => text.trim() === "")) {
            throw new ConsentDefinitionError(
                `The version [${version}] of [${purpose}] has an empty text.`,
            );
        }
    }
}
