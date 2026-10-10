import { isIpAddress } from "./ip";
import {
    isRecord,
    parseEntry,
    parseError,
    parseErrors,
    parseMessage,
    parsePurposes,
    parseRetryAfter,
} from "./parse";
import type {
    Expired,
    Invalid,
    NotFound,
    Operation,
    RateLimited,
    RequestOptions,
    Resolvable,
    Unavailable,
    UnavailableFailure,
    UnavailableReason,
    WaitlistClient,
    WaitlistClientOptions,
    WaitlistEntry,
    WithdrawResult,
} from "./types";

export const DEFAULT_TIMEOUT = 8_000;

export const DEFAULT_CLIENT_IP_HEADER = "X-Waitlist-Client-Ip";

interface Call {
    method: "GET" | "POST" | "PUT";
    path: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
}

interface Answer {
    status: "answered";
    code: number;
    body: unknown;
    headers: Headers;
}

const NOT_FOUND: NotFound = { status: "not_found" };

const EXPIRED: Expired = { status: "expired" };

/**
 * A client for the package's HTTP API. Every call resolves to a result with a
 * `status` and never throws.
 */
export function createWaitlistClient(
    options: WaitlistClientOptions,
): WaitlistClient {
    const send =
        options.fetch ??
        ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const clientIpHeader = options.clientIpHeader ?? DEFAULT_CLIENT_IP_HEADER;
    const report = options.onUnavailable ?? reportToConsole;

    const unavailable = (
        operation: Operation,
        reason: UnavailableReason,
        code?: string,
    ): Unavailable => {
        report(
            code === undefined
                ? { operation, reason }
                : { operation, reason, code },
        );

        return { status: "unavailable", reason };
    };

    const unexpected = (operation: Operation, answer: Answer): Unavailable =>
        unavailable(operation, `http-${answer.code}`);

    // Laravel answers a route that does not exist with a 404 too, e.g. for a
    // URL without the routes' prefix; only the API's own carries an `error`.
    const notFound = (
        operation: Operation,
        answer: Answer,
    ): NotFound | Unavailable =>
        parseError(answer.body) === null
            ? unexpected(operation, answer)
            : NOT_FOUND;

    const withEntry = <Result>(
        operation: Operation,
        answer: Answer,
        result: (entry: WaitlistEntry) => Result,
    ): Result | Unavailable => {
        const entry = parseEntry(answer.body);

        return entry === null
            ? unavailable(operation, "invalid-response")
            : result(entry);
    };

    async function call(
        operation: Operation,
        request: Call,
        requestOptions: RequestOptions = {},
    ): Promise<Answer | Unavailable> {
        const base = resolve(options.url);

        if (base === undefined) {
            return unavailable(operation, "not-configured");
        }

        const token = resolve(options.token);
        const headers: Record<string, string> = { Accept: "application/json" };

        if (token !== undefined) {
            headers.Authorization = `Bearer ${token}`;
        }

        if (request.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const { visitorIp, signal } = requestOptions;

        if (visitorIp !== undefined && isIpAddress(visitorIp)) {
            headers[clientIpHeader] = visitorIp;
        }

        const init: RequestInit = {
            method: request.method,
            headers,
            // The API answers JSON without redirecting; a redirect means a wrong URL.
            redirect: "manual",
            signal: AbortSignal.any(
                signal === undefined
                    ? [AbortSignal.timeout(timeout)]
                    : [AbortSignal.timeout(timeout), signal],
            ),
        };

        if (request.body !== undefined) {
            init.body = JSON.stringify(request.body);
        }

        let response: Response;

        try {
            response = await send(endpoint(base, request), init);
        } catch (error) {
            if (signal?.aborted === true) {
                return unavailable(operation, "aborted");
            }

            return isTimeout(error)
                ? unavailable(operation, "timeout")
                : unavailable(operation, "network", errorCode(error));
        }

        return {
            status: "answered",
            code: response.status,
            body: await readJson(response),
            headers: response.headers,
        };
    }

    async function unsubscribe(
        token: string,
        requestOptions: RequestOptions & { purpose?: string | undefined } = {},
    ): Promise<WithdrawResult> {
        const answer = await call(
            "unsubscribe",
            {
                method: "POST",
                path: `/unsubscribe/${segment(token)}`,
                query: { purpose: requestOptions.purpose },
            },
            requestOptions,
        );

        if (answer.status === "unavailable") {
            return answer;
        }

        switch (answer.code) {
            case 200:
                return withEntry("unsubscribe", answer, (entry) => ({
                    status: "unsubscribed" as const,
                    entry,
                }));
            case 404:
                return notFound("unsubscribe", answer);
            case 422:
                // The API only refuses a purpose, so the overload without one has no `invalid`.
                return requestOptions.purpose === undefined
                    ? unexpected("unsubscribe", answer)
                    : invalid(answer);
            case 429:
                return rateLimited(answer);
            default:
                return unexpected("unsubscribe", answer);
        }
    }

    return {
        async purposes(query = {}, requestOptions) {
            const answer = await call(
                "purposes",
                {
                    method: "GET",
                    path: "/purposes",
                    query: { list: query.list, locale: query.locale },
                },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 200: {
                    const purposes = parsePurposes(answer.body);

                    return purposes === null
                        ? unavailable("purposes", "invalid-response")
                        : { status: "ok", purposes };
                }
                case 404:
                    return notFound("purposes", answer);
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("purposes", answer);
            }
        },

        async subscribe(input, requestOptions) {
            const answer = await call(
                "subscribe",
                {
                    method: "POST",
                    path: "",
                    body: {
                        email: input.email,
                        list: input.list,
                        purposes: input.purposes,
                        metadata: input.metadata,
                    },
                },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 202:
                    return { status: "accepted" };
                case 422:
                    return invalid(answer);
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("subscribe", answer);
            }
        },

        async requestManageLink(input, requestOptions) {
            const answer = await call(
                "requestManageLink",
                { method: "POST", path: "/manage-link", body: input },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 202:
                    return { status: "requested" };
                case 422:
                    return invalid(answer);
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("requestManageLink", answer);
            }
        },

        async confirmation(token, requestOptions) {
            const answer = await call(
                "confirmation",
                { method: "GET", path: `/confirm/${segment(token)}` },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 200:
                    return withEntry("confirmation", answer, (entry) => ({
                        status: "ok" as const,
                        entry,
                    }));
                case 404:
                    return notFound("confirmation", answer);
                case 410:
                    return EXPIRED;
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("confirmation", answer);
            }
        },

        async confirm(token, requestOptions) {
            const answer = await call(
                "confirm",
                { method: "POST", path: `/confirm/${segment(token)}` },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 200:
                    return withEntry("confirm", answer, (entry) => ({
                        status: "confirmed" as const,
                        entry,
                    }));
                case 404:
                    return notFound("confirm", answer);
                case 410:
                    return EXPIRED;
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("confirm", answer);
            }
        },

        unsubscribe: unsubscribe as WaitlistClient["unsubscribe"],

        async manage(token, requestOptions) {
            const answer = await call(
                "manage",
                { method: "GET", path: `/manage/${segment(token)}` },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 200:
                    return withEntry("manage", answer, (entry) => ({
                        status: "ok" as const,
                        entry,
                    }));
                case 404:
                    return notFound("manage", answer);
                case 410:
                    return EXPIRED;
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("manage", answer);
            }
        },

        async updatePurposes(token, purposes, requestOptions) {
            const answer = await call(
                "updatePurposes",
                {
                    method: "PUT",
                    path: `/manage/${segment(token)}/purposes`,
                    body: { purposes },
                },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 200:
                    return withEntry("updatePurposes", answer, (entry) => ({
                        status: "updated" as const,
                        entry,
                    }));
                case 409:
                    return {
                        status: "conflict",
                        message: parseMessage(answer.body),
                    };
                case 422:
                    return invalid(answer);
                case 404:
                    return notFound("updatePurposes", answer);
                case 410:
                    return EXPIRED;
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("updatePurposes", answer);
            }
        },

        async leave(token, requestOptions) {
            const answer = await call(
                "leave",
                {
                    method: "POST",
                    path: `/manage/${segment(token)}/unsubscribe`,
                },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 200:
                    return withEntry("leave", answer, (entry) => ({
                        status: "unsubscribed" as const,
                        entry,
                    }));
                case 404:
                    return notFound("leave", answer);
                case 410:
                    return EXPIRED;
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("leave", answer);
            }
        },

        async exportData(token, requestOptions) {
            const answer = await call(
                "exportData",
                { method: "POST", path: `/manage/${segment(token)}/data` },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 200:
                    return isRecord(answer.body)
                        ? { status: "ok", data: answer.body }
                        : unavailable("exportData", "invalid-response");
                case 404:
                    return notFound("exportData", answer);
                case 410:
                    return EXPIRED;
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("exportData", answer);
            }
        },

        async erase(token, requestOptions) {
            const answer = await call(
                "erase",
                {
                    method: "POST",
                    path: `/manage/${segment(token)}/erase`,
                    body: { confirm: true },
                },
                requestOptions,
            );

            if (answer.status === "unavailable") {
                return answer;
            }

            switch (answer.code) {
                case 200:
                    return { status: "erased" };
                case 404:
                    return notFound("erase", answer);
                case 410:
                    return EXPIRED;
                case 429:
                    return rateLimited(answer);
                default:
                    return unexpected("erase", answer);
            }
        },
    };
}

function reportToConsole(failure: UnavailableFailure): void {
    const reason =
        failure.code === undefined
            ? failure.reason
            : `${failure.reason} (${failure.code})`;

    console.error(
        `[laravel-waitlist] ${failure.operation} unavailable: ${reason}`,
    );
}

function resolve(value: Resolvable | undefined): string | undefined {
    const resolved = typeof value === "function" ? value() : value;

    return resolved === undefined || resolved === "" ? undefined : resolved;
}

function endpoint(base: string, request: Call): string {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(request.query ?? {})) {
        if (value !== undefined) {
            query.set(key, value);
        }
    }

    const search = query.size > 0 ? `?${query.toString()}` : "";

    return `${base.replace(/\/+$/, "")}${request.path}${search}`;
}

function segment(token: string): string {
    return encodeURIComponent(token);
}

function isTimeout(error: unknown): boolean {
    return error instanceof Error && error.name === "TimeoutError";
}

/** The code fetch puts in the error's cause, e.g. `ECONNREFUSED` from undici. */
function errorCode(error: unknown): string | undefined {
    const cause = isRecord(error) ? error.cause : undefined;
    const code = isRecord(cause) ? cause.code : undefined;

    // Only a code-shaped value: anything else may carry a host or an address.
    return typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code)
        ? code
        : undefined;
}

async function readJson(response: Response): Promise<unknown> {
    try {
        const text = await response.text();

        return text === "" ? null : (JSON.parse(text) as unknown);
    } catch {
        return null;
    }
}

function rateLimited(answer: Answer): RateLimited {
    return {
        status: "rate_limited",
        retryAfter: parseRetryAfter(answer.headers),
    };
}

function invalid(answer: Answer): Invalid {
    return {
        status: "invalid",
        message: parseMessage(answer.body),
        errors: parseErrors(answer.body),
    };
}
