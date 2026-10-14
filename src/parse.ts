import type {
    ConflictReason,
    EntryStatus,
    InvalidReason,
    PurposeWording,
    ValidationErrors,
    WaitlistEntry,
} from "./types";

const ENTRY_STATUSES: readonly string[] = [
    "pending",
    "confirmed",
    "unsubscribed",
] satisfies readonly EntryStatus[];

const CONFLICT_REASONS: readonly string[] = [
    "not_subscribed",
    "list_unavailable",
] satisfies readonly ConflictReason[];

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

/** A figure a page renders, so `Infinity`, a fraction or a negative number is no answer. */
function isWholeNumberFrom(value: unknown, minimum: number): value is number {
    return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function data(body: unknown): unknown {
    return isRecord(body) ? body.data : undefined;
}

export function parseEntry(body: unknown): WaitlistEntry | null {
    const entry = data(body);
    // An API from before it asked confirmed addresses again sends none.
    const answerBy = isRecord(entry) ? (entry.answer_by ?? null) : null;

    if (
        !isRecord(entry) ||
        typeof entry.project !== "string" ||
        typeof entry.list !== "string" ||
        typeof entry.status !== "string" ||
        !ENTRY_STATUSES.includes(entry.status) ||
        !Array.isArray(entry.purposes) ||
        !entry.purposes.every((purpose) => typeof purpose === "string") ||
        !isStringOrNull(entry.confirmed_at) ||
        !isStringOrNull(entry.unsubscribed_at) ||
        typeof entry.created_at !== "string" ||
        !isStringOrNull(answerBy)
    ) {
        return null;
    }

    return {
        project: entry.project,
        list: entry.list,
        status: entry.status as EntryStatus,
        purposes: entry.purposes,
        confirmedAt: entry.confirmed_at,
        unsubscribedAt: entry.unsubscribed_at,
        createdAt: entry.created_at,
        answerBy,
    };
}

export function parsePurposes(body: unknown): PurposeWording[] | null {
    const purposes = data(body);

    if (!Array.isArray(purposes)) {
        return null;
    }

    const parsed: PurposeWording[] = [];

    for (const wording of purposes) {
        if (
            !isRecord(wording) ||
            typeof wording.purpose !== "string" ||
            typeof wording.version !== "string" ||
            !isStringOrNull(wording.locale) ||
            typeof wording.text !== "string" ||
            typeof wording.hash !== "string" ||
            typeof wording.required !== "boolean"
        ) {
            return null;
        }

        parsed.push({
            purpose: wording.purpose,
            version: wording.version,
            locale: wording.locale,
            text: wording.text,
            hash: wording.hash,
            required: wording.required,
        });
    }

    return parsed;
}

/**
 * The proof the bot check hands out with the wording; null when it has none.
 * An unusable one counts as none: the wording is still right, and the signup
 * it would have gone with is refused as a failed check anyway.
 */
export function parseChallenge(body: unknown): string | null {
    return isRecord(body) &&
        typeof body.challenge === "string" &&
        body.challenge !== ""
        ? body.challenge
        : null;
}

export function parseCount(
    body: unknown,
): { list: string; count: number | null } | null {
    const count = data(body);

    if (
        !isRecord(count) ||
        typeof count.list !== "string" ||
        !(count.count === null || isWholeNumberFrom(count.count, 0))
    ) {
        return null;
    }

    return { list: count.list, count: count.count };
}

export function parsePosition(body: unknown): {
    project: string;
    list: string;
    entryStatus: EntryStatus;
    position: number | null;
} | null {
    const place = data(body);

    if (
        !isRecord(place) ||
        typeof place.project !== "string" ||
        typeof place.list !== "string" ||
        typeof place.status !== "string" ||
        !ENTRY_STATUSES.includes(place.status) ||
        !(place.position === null || isWholeNumberFrom(place.position, 1))
    ) {
        return null;
    }

    return {
        project: place.project,
        list: place.list,
        entryStatus: place.status as EntryStatus,
        position: place.position,
    };
}

/** The `error` the API names its own refusals with, e.g. `invalid_token`. */
export function parseError(body: unknown): string | null {
    return isRecord(body) && typeof body.error === "string" ? body.error : null;
}

/** Why the API answered `409`; null for an `error` this client does not know. */
export function parseConflictReason(body: unknown): ConflictReason | null {
    const error = parseError(body);

    return error !== null && CONFLICT_REASONS.includes(error)
        ? (error as ConflictReason)
        : null;
}

/** Why the API answered `422` beyond the fields; null for validation errors. */
export function parseInvalidReason(body: unknown): InvalidReason | null {
    return parseError(body) === "spam_check_failed"
        ? "spam_check_failed"
        : null;
}

export function parseMessage(body: unknown): string | null {
    return isRecord(body) && typeof body.message === "string"
        ? body.message
        : null;
}

export function parseErrors(body: unknown): ValidationErrors {
    const errors = isRecord(body) ? body.errors : undefined;

    if (!isRecord(errors)) {
        return {};
    }

    const parsed: ValidationErrors = {};

    for (const [field, messages] of Object.entries(errors)) {
        if (Array.isArray(messages)) {
            parsed[field] = messages.filter(
                (message): message is string => typeof message === "string",
            );
        }
    }

    return parsed;
}

export function parseRetryAfter(headers: Headers): number | null {
    const value = headers.get("Retry-After");

    if (value === null || !/^\d+$/.test(value.trim())) {
        return null;
    }

    return Number(value.trim());
}
