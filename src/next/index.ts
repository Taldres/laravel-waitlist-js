import "server-only";
// With the extension: `next` has no exports map, so Node itself resolves only the file.
import { headers } from "next/headers.js";
import { createWaitlistClient } from "../client";
import { isIpAddress } from "../ip";
import type { WaitlistClient, WaitlistClientOptions } from "../types";

export * from "../index";

/** Where `visitorIp()` looks first; set by Traefik, nginx and most hosting platforms. */
export const DEFAULT_VISITOR_IP_HEADERS = [
    "x-real-ip",
    "x-forwarded-for",
] as const;

export interface VisitorIpOptions {
    /** The headers your proxy sets, in order; only trust ones it overwrites. */
    headers?: readonly string[] | undefined;
}

/**
 * The visitor's address from the request headers, for the API's per-visitor
 * rate limit. Undefined when no header holds an IP address.
 */
export async function visitorIp(
    options: VisitorIpOptions = {},
): Promise<string | undefined> {
    const requestHeaders = await headers();

    for (const name of options.headers ?? DEFAULT_VISITOR_IP_HEADERS) {
        // A proxy appends to X-Forwarded-For, so the first entry is the client.
        const value = requestHeaders.get(name)?.split(",")[0]?.trim();

        if (value !== undefined && isIpAddress(value)) {
            return value;
        }
    }

    return undefined;
}

export interface EnvClientOptions extends Omit<
    WaitlistClientOptions,
    "url" | "token"
> {
    /** Defaults to `WAITLIST_API_URL`. */
    urlVariable?: string | undefined;
    /** Appended to the variable's URL when it holds your API's base rather than the routes' prefix, e.g. `/waitlist`. */
    path?: string | undefined;
    /** Defaults to `WAITLIST_API_TOKEN`. */
    tokenVariable?: string | undefined;
}

/**
 * A client that reads its URL and token from the environment when a request
 * is made, so a build without them still succeeds, and that never lets Next.js
 * cache a response.
 */
export function createWaitlistClientFromEnv(
    options: EnvClientOptions = {},
): WaitlistClient {
    const {
        urlVariable = "WAITLIST_API_URL",
        path,
        tokenVariable = "WAITLIST_API_TOKEN",
        fetch: send = fetch,
        ...rest
    } = options;

    return createWaitlistClient({
        ...rest,
        url: () => withPath(process.env[urlVariable], path),
        token: () => process.env[tokenVariable],
        fetch: (input, init) => send(input, { ...init, cache: "no-store" }),
    });
}

function withPath(
    base: string | undefined,
    path: string | undefined,
): string | undefined {
    if (!base || path === undefined) {
        return base;
    }

    return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
