import type {
    ConflictReason,
    EntryStatus,
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

function data(body: unknown): unknown {
    return isRecord(body) ? body.data : undefined;
}

export function parseEntry(body: unknown): WaitlistEntry | null {
    const entry = data(body);

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
        typeof entry.created_at !== "string"
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
