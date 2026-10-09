import { vi } from "vitest";
import { createWaitlistClient } from "../src";
import type { WaitlistClientOptions } from "../src";

export interface RecordedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

export const ENTRY = {
    project: "acme",
    list: "beta",
    status: "confirmed",
    purposes: ["waitlist"],
    confirmed_at: "2026-10-09T10:00:00.000000Z",
    unsubscribed_at: null,
    created_at: "2026-10-09T09:00:00.000000Z",
};

export const PARSED_ENTRY = {
    project: "acme",
    list: "beta",
    status: "confirmed",
    purposes: ["waitlist"],
    confirmedAt: "2026-10-09T10:00:00.000000Z",
    unsubscribedAt: null,
    createdAt: "2026-10-09T09:00:00.000000Z",
};

export function json(
    status: number,
    body?: unknown,
    headers: Record<string, string> = {},
): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
}

export function fakeApi(
    respond: (request: RecordedRequest) => Response | Promise<Response>,
    options: Partial<WaitlistClientOptions> = {},
) {
    const requests: RecordedRequest[] = [];
    const onUnavailable = vi.fn();

    const fetch = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
            const request: RecordedRequest = {
                url: input instanceof Request ? input.url : input.toString(),
                method: init?.method ?? "GET",
                headers: Object.fromEntries(new Headers(init?.headers)),
                body:
                    typeof init?.body === "string"
                        ? (JSON.parse(init.body) as unknown)
                        : undefined,
            };

            requests.push(request);

            return respond(request);
        },
    );

    const client = createWaitlistClient({
        url: "https://api.example.com/waitlist",
        token: "secret-token",
        fetch,
        onUnavailable,
        ...options,
    });

    return { client, fetch, requests, onUnavailable };
}
