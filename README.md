# Laravel Waitlist JS

> **A typed client for the [Laravel Waitlist](https://github.com/Taldres/laravel-waitlist) HTTP API, with helpers for Next.js.**
>
> Sign people up from a Server Action, confirm and unsubscribe from your own pages, and keep the consent wording where your site shows it.

![Tests](https://img.shields.io/github/actions/workflow/status/taldres/laravel-waitlist-js/tests.yml?label=tests)
![npm](https://img.shields.io/npm/v/@taldres/laravel-waitlist)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Next.js](https://img.shields.io/badge/Next.js-15%20%7C%2016-black)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

`taldres/laravel-waitlist` stores the signups, runs the double opt-in, records consent per purpose and sends nothing itself. This package is its counterpart in JavaScript: every route of the API as a typed function, consent wording defined in your code, and what Next.js needs to call the API from the server, where the project token stays.

- **Never throws.** Every call resolves to a result with a `status` you `switch` over: `accepted`, `invalid`, `rate_limited`, `unavailable` and so on.
- **Never leaks.** Failures report the operation, a reason and at most an error code such as `ECONNREFUSED`, never the token, a header or an address.
- **No runtime dependencies.** The client only needs `fetch`; it runs in Node.js, edge runtimes and browsers.
- **Next.js aware.** `@taldres/laravel-waitlist/next` reads the visitor's address, takes the configuration from the environment per request, keeps responses out of the Next.js cache and refuses to be imported into client code.

## Contents

- [Installation](#installation)
- [Next.js](#nextjs)
- [Without Next.js](#without-nextjs)
- [Consent wording](#consent-wording)
- [Results](#results)
- [API reference](#api-reference)
- [Rate limits and the visitor's address](#rate-limits-and-the-visitors-address)
- [Security](#security)
- [Testing your integration](#testing-your-integration)
- [Compatibility](#compatibility)

## Installation

```bash
pnpm add @taldres/laravel-waitlist
```

The API side is [taldres/laravel-waitlist](https://github.com/Taldres/laravel-waitlist) with its routes enabled (`WAITLIST_ROUTES_ENABLED=true`): they are off by default and answer `404` while off. For a server that calls it with a token per project, see [architecture C](https://github.com/Taldres/laravel-waitlist/blob/main/docs/securing-the-endpoints.md#the-three-architectures) there.

## Next.js

### Configure

```dotenv
# The routes' prefix, as waitlist.routes.prefix sets it
WAITLIST_API_URL=https://api.example.com/waitlist
# The project's token; server-side only
WAITLIST_API_TOKEN=
```

```ts
// lib/waitlist.ts
import { createWaitlistClientFromEnv } from "@taldres/laravel-waitlist/next";

export const waitlist = createWaitlistClientFromEnv();
```

The client reads both variables when a request is made, so `next build` succeeds without them; a call then answers `{ status: "unavailable", reason: "not-configured" }`. Importing `@taldres/laravel-waitlist/next` into a Client Component fails the build, so the token cannot end up in the browser.

If your app also calls endpoints of its own on that API, `WAITLIST_API_URL` may hold the API's base instead, e.g. `https://api.example.com/api/v1`. Name the routes' prefix beneath it:

```ts
export const waitlist = createWaitlistClientFromEnv({ path: "/waitlist" });
```

### Sign up from a Server Action

```ts
// app/actions.ts
"use server";

import { visitorIp } from "@taldres/laravel-waitlist/next";
import { consent } from "@/lib/consent";
import { waitlist } from "@/lib/waitlist";

export type SignupState = {
    status: "idle" | "sent" | "error";
    message?: string;
};

export async function joinWaitlist(
    _previous: SignupState,
    form: FormData,
): Promise<SignupState> {
    const version = form.get("consent_version");

    if (!consent.isVersion(version)) {
        return {
            status: "error",
            message: "Please reload the page and try again.",
        };
    }

    const ip = await visitorIp();

    // Limit each visitor here: the API sees only this server's address.
    // if (!(await allowSignup(ip))) return { status: "error", message: "Too many attempts." };

    const result = await waitlist.subscribe(
        {
            email: String(form.get("email") ?? ""),
            list: "beta",
            purposes: consent.choose({ version }),
        },
        { visitorIp: ip },
    );

    switch (result.status) {
        case "accepted":
            return { status: "sent", message: "Check your inbox to confirm." };
        case "invalid":
            return {
                status: "error",
                message: result.errors.email?.[0] ?? "Please check your input.",
            };
        case "rate_limited":
            return {
                status: "error",
                message: "Too many attempts. Please wait a moment.",
            };
        case "unavailable":
            return {
                status: "error",
                message: "Something went wrong. Please try again.",
            };
    }
}
```

`accepted` means the same for new and known addresses, so neither your action nor a visitor can tell them apart. Show the consent text from `consent.text({ version: consent.current })` next to a hidden `consent_version` field.

### Bot check

A common setup verifies a challenge, such as Cloudflare Turnstile, in the Server Action before it calls the API. Challenge tokens can be verified only once, so check in one place:

- The action checks, and the API keeps its default protector.
- Or the action drops its own check and forwards the proof, so the API's `SpamProtector` verifies it:

```ts
const result = await waitlist.subscribe(
    { email, list: "beta", purposes: consent.choose({ version }) },
    {
        visitorIp: ip,
        challenge: String(form.get("cf-turnstile-response") ?? ""),
    },
);
```

Doing both makes the API refuse every signup with "Spam check failed.", see [Bot protection](https://github.com/Taldres/laravel-waitlist/blob/main/docs/securing-the-endpoints.md#bot-protection-via-spamprotector).

### Confirm and unsubscribe pages

Point the mail links at your pages with `urls()` in the project's definition, e.g. `https://example.com/confirm?token={token}`. Mail scanners and link previews follow every link they find, so a page must not act when it renders: one that confirms defeats the double opt-in, one that unsubscribes removes people without a click. Render the state with `confirmation(token)` and let a button call `confirm(token)`; the API itself acts only on `POST`:

```tsx
// app/confirm/page.tsx
import { waitlist } from "@/lib/waitlist";
import { confirmSignup } from "./actions";

export default async function ConfirmPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;
    const result = token
        ? await waitlist.confirmation(token)
        : { status: "not_found" as const };

    switch (result.status) {
        case "ok":
            return result.entry.status === "confirmed" ? (
                <p>Your email is already confirmed.</p>
            ) : (
                <form action={confirmSignup}>
                    <input type="hidden" name="token" value={token} />
                    <button type="submit">Confirm my email</button>
                </form>
            );
        case "expired":
            return <p>This link has expired. Please sign up again.</p>;
        case "not_found":
            return <p>This link is not valid.</p>;
        default:
            return <p>Please open the link from the email again later.</p>;
    }
}
```

```ts
// app/confirm/actions.ts
"use server";

import { redirect } from "next/navigation";
import { waitlist } from "@/lib/waitlist";

export async function confirmSignup(form: FormData) {
    const result = await waitlist.confirm(String(form.get("token") ?? ""));

    redirect(
        result.status === "confirmed" ? "/confirm/done" : "/confirm/failed",
    );
}
```

`confirmation()` and `unsubscription()` answer for the link, not for the person, so look at `entry.status` before you offer the button:

| Call                    | `ok`                                                                                              | `not_found`                                   | `expired`                    |
| ----------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------- |
| `confirmation(token)`   | The link is open: `entry.status` is `pending`, or `confirmed` when the link was used before.      | The token is unknown, or the person has left. | The link's lifetime is over. |
| `unsubscription(token)` | The token is known, also when the person has left already: `entry.status` is then `unsubscribed`. | The token is unknown.                         | The call has no such answer. |

A repeated `confirm()` answers `confirmed` again while the API still holds the link. Once the person has left, a repeat is `not_found`.

The unsubscribe page works the same way: `unsubscription(token)` renders the state of the link in every mail, and a button calls `unsubscribe(token)`. Pass `{ purpose: "newsletter" }` to either to cover one purpose only, which is `invalid` for an empty purpose.

### Preference page

`requestManageLink({ token })` takes the unsubscribe token from a mail, `requestManageLink({ email, list })` an address. The link it mails points at your page (`manage` in `urls()`) and carries the manage token, which `manage()`, `updatePurposes()`, `leave()`, `exportData()` and `erase()` take instead.

- By address, only confirmed addresses get a mail, at most once per `manage.request_cooldown` in the API (5 minutes by default). The answer is always `requested`, so show the same message either way.
- A manage link lives `manage.token_ttl` minutes (60 by default); after that the calls answer `expired`, so offer to mail a new link. A new link replaces the previous one.
- `erase()` cannot be undone, and the client sends the `confirm: true` the API requires itself. Ask the person to confirm in your UI first.

## Without Next.js

The client works wherever `fetch` does: Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge, a browser.

```ts
import { createWaitlistClient } from "@taldres/laravel-waitlist";

const waitlist = createWaitlistClient({
    url: "https://api.example.com/waitlist",
    token: process.env.WAITLIST_API_TOKEN,
});
```

A static site that talks to the API directly ([architecture A](https://github.com/Taldres/laravel-waitlist/blob/main/docs/securing-the-endpoints.md#the-three-architectures)) creates the client without a token; in a browser, a client with one throws a `WaitlistConfigurationError`. It may then only send versions, never text, as the API refuses wording from guests.

Checks the API puts on its forms travel as headers. Its signup group is `purposes()`, `subscribe()` and `requestManageLink({ email })`; the token routes, `requestManageLink({ token })` among them, never get the middleware you add for it (`routes.group_middleware.signup` in the API). With CSRF on the signup, send the `XSRF-TOKEN` cookie back, and send a challenge token with the request it belongs to:

```ts
const xsrfToken = () =>
    document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1];

const waitlist = createWaitlistClient({
    url: "https://example.com/waitlist",
    headers: () => {
        const token = xsrfToken();

        return token === undefined
            ? undefined
            : { "X-XSRF-TOKEN": decodeURIComponent(token) };
    },
    // For an API on another origin that reads cookies, e.g. a subdomain.
    credentials: "include",
});

await waitlist.subscribe(
    { email, list: "beta", purposes: { waitlist: "2026-10" } },
    { challenge: challengeToken },
);
```

`GET /purposes` sets the cookie, so load the wording first. `Accept`, `Content-Type` and, with a token, `Authorization` are always the client's own.

The challenge header is whatever the API's `SpamProtector` reads; `X-Waitlist-Challenge` is the name its [examples](https://github.com/Taldres/laravel-waitlist/blob/main/docs/securing-the-endpoints.md#bot-protection-via-spamprotector) use. It matters only for `subscribe()` and `requestManageLink({ email })`, which anyone can call with an address, not for the token request or `purposes()`. A failed check comes back as `invalid` with `reason: "spam_check_failed"`, the message "Spam check failed." and empty `errors`, so ask for a new challenge without matching the message.

CSRF on the signup also answers `419` to a server that calls with a bearer token and no cookie; use an origin check there instead: the API's project names the websites with `$project->origins([...])`, which refuses the browsers of other websites with a `403` (`unavailable`, `http-403`). A request without an `Origin` header, as from a server, is not checked, and neither is a token link. A browser on another origin also needs [CORS](https://github.com/Taldres/laravel-waitlist/blob/main/docs/securing-the-endpoints.md#cors) on the API, which stays in its `config/cors.php`: `paths` that cover the routes, the websites in `allowed_origins`, `supports_credentials` for `credentials: "include"`, your custom headers in `allowed_headers` if you narrowed them, and `Retry-After` in `exposed_headers`, or `retryAfter` is `null`. See [Checks for your forms only](https://github.com/Taldres/laravel-waitlist/blob/main/docs/securing-the-endpoints.md#checks-for-your-forms-only) for the other checks.

## Consent wording

The wording people agree to lives in your code, versioned, and the signup sends the version with what the form showed:

```ts
// lib/consent.ts
import { defineConsent } from "@taldres/laravel-waitlist";

export const consent = defineConsent(
    "waitlist",
    {
        "2026-10":
            "Email me when Acme launches. I can unsubscribe with the link in every email.",
        "2026-11": {
            en: "Email me when Acme launches.",
            de: "Schreibt mir, wenn Acme startet.",
        },
    },
    { current: "2026-11" },
);
```

| Call                                                | Sends                                     | For a project that                                                                                           |
| --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `consent.choose({ version, locale })`               | `{ waitlist: { version, locale, text } }` | takes wording from its servers (`wordingFromCallers()`), which registers a version the first time it sees it |
| `await consent.chooseWithHash({ version, locale })` | `{ waitlist: { version, locale, hash } }` | keeps the wording itself; a text that drifted is refused                                                     |

Never reword a version: add a new one and make it `current`. Keep old versions until no open form can post them; `consent.isVersion()` checks what a form posted. A version with a text per locale needs the `locale`. See [Wording sent by your servers](https://github.com/Taldres/laravel-waitlist/blob/main/docs/purposes-and-wording.md#wording-sent-by-your-servers).

A definition with a mistake throws a `ConsentDefinitionError` when the module loads, so it fails the build rather than a signup.

## Results

Every method resolves to one of these, discriminated by `status`:

| Status                                                                          | Meaning                                           | Fields                                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `accepted`, `requested`, `confirmed`, `ok`, `updated`, `unsubscribed`, `erased` | It worked                                         | `entry`, `purposes` or `data`, depending on the call                                                                            |
| `invalid`                                                                       | `422`: the API refused the input or the bot check | `message`, `errors` keyed by field, e.g. `errors["metadata.company"]`; `reason: "spam_check_failed"` when the bot check refused |
| `not_found`                                                                     | `404` the API names: unknown token or list        |                                                                                                                                 |
| `expired`                                                                       | `410`: the link expired                           |                                                                                                                                 |
| `conflict`                                                                      | `409`: the address has left, or the list is gone  | `message`, `reason`: `"not_subscribed"`, `"list_unavailable"` or `null`                                                         |
| `rate_limited`                                                                  | `429`                                             | `retryAfter` in seconds, or `null`                                                                                              |
| `unavailable`                                                                   | No usable answer                                  | `reason`                                                                                                                        |

With `reason: "not_subscribed"` the address has left and can sign up again; with `"list_unavailable"` the list was removed since, and leaving still works.

`reason` is one of `not-configured`, `timeout`, `aborted`, `network`, `invalid-response` or `http-<status>` for a status the call has no branch for. Every `unavailable` result is also passed to `onUnavailable`, which logs to `console.error` by default, or to `console.warn` for `not-configured`, which a deploy without the API URL answers on purpose. For `network`, it also gets the runtime's error `code` when there is one, such as `ECONNREFUSED` or `ENOTFOUND`; the result leaves it out.

What the statuses without a name of their own mean:

| Status                | Result                    | Usually                                                                                                                                                       |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`                 | `unavailable`, `http-401` | The API wants credentials (`authentication.required`, or the authenticated project resolver) and got none it accepts                                          |
| `403`                 | `unavailable`, `http-403` | A guest sent wording `text`, or a gate or origin check refused the caller                                                                                     |
| `404` without `error` | `unavailable`, `http-404` | A wrong prefix, routes switched off, or the `useWaitlist` gate, see below                                                                                     |
| `419`                 | `unavailable`, `http-419` | The API's CSRF or form check, e.g. `web` on the signup group                                                                                                  |
| `422`                 | `invalid`                 | Validation, or the bot check                                                                                                                                  |
| `429`                 | `rate_limited`            | A rate limit; `retryAfter` says when to try again                                                                                                             |
| `500`                 | `unavailable`, `http-500` | The API's configuration: a setting that does not read, which its log names. On `subscribe` and `confirm` nothing was stored, so a retry after the fix is safe |

A `404` without an `error` did not come from the package's own refusals, so it is not reported as an invalid link. It is a URL without the routes' prefix, routes that are switched off (`WAITLIST_ROUTES_ENABLED`, off by default), or the `useWaitlist` gate keeping the caller from the project. A wrong prefix and switched-off routes count against no rate limit; the gate answers after it.

An `entry` never carries the address:

```ts
{ project, list, status: "pending" | "confirmed" | "unsubscribed", purposes, confirmedAt, unsubscribedAt, createdAt }
```

## API reference

### `createWaitlistClient(options)`

| Option           | Default                |                                                                                                                   |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `url`            | required               | The routes' prefix. A string, or a function read per request.                                                     |
| `token`          | none                   | The project's token. A string, or a function read per request.                                                    |
| `fetch`          | global `fetch`         | For tests, or a runtime without a global `fetch`.                                                                 |
| `timeout`        | `8000`                 | Milliseconds before a call is `unavailable` with `timeout`.                                                       |
| `clientIpHeader` | `X-Waitlist-Client-Ip` | Must match the API's `authentication.client_ip_header`.                                                           |
| `onUnavailable`  | `console.error`        | Receives `{ operation, reason, code }`. The default warns for `not-configured` instead.                           |
| `headers`        | none                   | Sent with every request, e.g. `X-XSRF-TOKEN`. An object, or a function called with the operation of each request. |
| `credentials`    | `fetch`'s default      | Passed to `fetch`; `"include"` sends cookies to an API on another origin.                                         |

Every method takes `{ visitorIp, signal, headers, challenge }` as its last argument; `headers` add to the client's for that request, and `challenge` is the proof of a bot check, sent in `X-Waitlist-Challenge`.

| Method                                            | Route                                                           | Statuses besides `rate_limited` and `unavailable`          |
| ------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `purposes({ list, locale })`                      | `GET /purposes`                                                 | `ok`, `not_found`                                          |
| `subscribe({ email, list, purposes, metadata })`  | `POST /`                                                        | `accepted`, `invalid`                                      |
| `requestManageLink({ email, list } \| { token })` | `POST /manage-link`, or `POST /unsubscribe/{token}/manage-link` | `requested`, `invalid`                                     |
| `confirmation(token)`                             | `GET /confirm/{token}`                                          | `ok`, `not_found`, `expired`                               |
| `confirm(token)`                                  | `POST /confirm/{token}`                                         | `confirmed`, `not_found`, `expired`                        |
| `unsubscription(token, { purpose })`              | `GET /unsubscribe/{token}`                                      | `ok`, `not_found`; `invalid` only with `purpose`           |
| `unsubscribe(token, { purpose })`                 | `POST /unsubscribe/{token}`                                     | `unsubscribed`, `not_found`; `invalid` only with `purpose` |
| `manage(token)`                                   | `GET /manage/{token}`                                           | `ok`, `not_found`, `expired`                               |
| `updatePurposes(token, purposes)`                 | `PUT /manage/{token}/purposes`                                  | `updated`, `invalid`, `conflict`, `not_found`, `expired`   |
| `leave(token)`                                    | `POST /manage/{token}/unsubscribe`                              | `unsubscribed`, `not_found`, `expired`                     |
| `exportData(token)`                               | `POST /manage/{token}/data`                                     | `ok`, `not_found`, `expired`                               |
| `erase(token)`                                    | `POST /manage/{token}/erase`                                    | `erased`, `not_found`, `expired`                           |

The token is the confirm token for `confirmation()` and `confirm()`; the unsubscribe token for `unsubscription()`, `unsubscribe()` and `requestManageLink({ token })`; the manage token for `manage()` and the calls after it. `confirmation()` and `unsubscription()` only report the state of a link, and `confirm()` and `unsubscribe()` act on it.

`updatePurposes()` takes a version or `{ version, locale, hash }` per purpose, never `text`: the preference page does not take wording, and the API refuses it with a `422`. Passing `text` is a type error, so use `consent.chooseWithHash()` there, not `consent.choose()`.

`metadata` takes only the fields the project and list define. The API refuses any other key, even with `null`, so leave out what is empty: Laravel turns an empty string into `null` before it validates, so `""` is refused as well, in `metadata` and as `list`.

### `@taldres/laravel-waitlist/next`

Re-exports everything above, plus:

| Export                                                                          |                                                                                                                                                                |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createWaitlistClientFromEnv({ urlVariable, path, tokenVariable, ...options })` | A client reading `WAITLIST_API_URL` and `WAITLIST_API_TOKEN`, or the variables you name, per request, with `cache: "no-store"`. `path` is appended to the URL. |
| `visitorIp({ headers })`                                                        | The visitor's address from `x-real-ip`, then the first entry of `x-forwarded-for`, or the headers you name; `undefined` without one.                           |

### Helpers

`isIpAddress(value)` checks IPv4 and IPv6, `sha256(text)` hashes as the API compares wording, and `DEFAULT_TIMEOUT` and `DEFAULT_CLIENT_IP_HEADER` hold the defaults. `WaitlistConfigurationError` is what `createWaitlistClient()` throws for a token in a browser.

## Rate limits and the visitor's address

All your visitors reach the API from your server's address, so the API caps your server as a whole and leaves the limit per visitor to you. Limit each visitor in your Server Action, next to your bot protection, before you call the API.

To have the API limit per visitor as well, set `authentication.client_ip_header` there to `X-Waitlist-Client-Ip` and pass `{ visitorIp }`. The client sends the header only when the value is an IP address. See [Servers calling for a project](https://github.com/Taldres/laravel-waitlist/blob/main/docs/securing-the-endpoints.md#servers-calling-for-a-project).

`visitorIp()` trusts the headers it reads. Read only the ones your proxy or platform overwrites: behind Traefik or nginx `x-real-ip`, on Cloudflare `cf-connecting-ip`:

```ts
const ip = await visitorIp({ headers: ["cf-connecting-ip"] });
```

## Security

- **Keep the token on the server.** It can sign people up and send wording that consents then point at. Use it from Server Actions, Route Handlers and server components only; `@taldres/laravel-waitlist/next` enforces that with `server-only`, and `createWaitlistClient()` throws a `WaitlistConfigurationError` when it is given a token in a browser.
- **The token goes with every request.** A client with a token also sends it to the token routes, such as `confirm()` and `unsubscribe()`, which do not need it. It only ever goes to the URL you configured, and with `client_ip_header` the API then counts those requests per visitor too. For a client that must not send it there, create a second one without a token.
- **Send the text you showed.** With `wordingFromCallers()`, the API records whatever text your server sends as what the person agreed to. `consent.choose()` sends the text from the same definition your form renders.
- **Nothing sensitive in logs.** The client never logs or returns the token, headers or addresses; `onUnavailable` only gets the operation, a reason and an error code.
- **Calling your own host.** A server that calls the API on the same machine through its public domain may not reach it. Use the internal address, e.g. `http://waitlist-api/api/v1/waitlist` on a shared Docker network, and forward the visitor's address.

## Testing your integration

Pass a `fetch` of your own and assert on what your code does with each status:

```ts
import { createWaitlistClient } from "@taldres/laravel-waitlist";
import { expect, it, vi } from "vitest";

it("shows the inbox hint once the API accepts the signup", async () => {
    const waitlist = createWaitlistClient({
        url: "https://api.example.com/waitlist",
        fetch: vi.fn(async () => new Response(null, { status: 202 })),
    });

    await expect(
        waitlist.subscribe({
            email: "jane@example.com",
            purposes: { waitlist: "2026-10" },
        }),
    ).resolves.toEqual({ status: "accepted" });
});
```

`@taldres/laravel-waitlist/next` imports `server-only`, which throws outside a React Server Component environment, so a test that imports it fails with "This module cannot be imported from a Client Component module". Code that only needs the client can import the root entry instead. Otherwise run the tests with Node's `react-server` condition, where `server-only` resolves to an empty module:

```bash
NODE_OPTIONS=--conditions=react-server vitest run
```

Or point `server-only` at an empty file in Vitest. `vi.mock` does not reach the import inside the package, so inline the package for the alias to apply:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        alias: {
            "server-only": new URL("./empty.js", import.meta.url).pathname,
        },
        server: { deps: { inline: ["@taldres/laravel-waitlist"] } },
    },
});
```

## Compatibility

|                  |                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Node.js          | 22.12 or later                                                                                                                      |
| Runtimes         | Node.js, edge runtimes, browsers: anything with `fetch`, `AbortSignal.any` and Web Crypto                                           |
| Next.js          | 15 and 16, for `@taldres/laravel-waitlist/next`                                                                                     |
| Module format    | ESM only                                                                                                                            |
| Laravel Waitlist | The HTTP API of [taldres/laravel-waitlist](https://github.com/Taldres/laravel-waitlist) `main`, which needs PHP 8.3+ and Laravel 13 |

## Contributing

Thank you for considering contributing! See the [contribution guide](.github/CONTRIBUTING.md).

## Security Vulnerabilities

Please review [our security policy](.github/SECURITY.md) on how to report security vulnerabilities.

## License

Laravel Waitlist JS is open-sourced software licensed under the [MIT license](LICENSE.md).
