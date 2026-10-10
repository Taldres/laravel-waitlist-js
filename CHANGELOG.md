# Release Notes

## [Unreleased](https://github.com/Taldres/laravel-waitlist-js/commits/main)

- `requestManageLink({ token })` posts to `/unsubscribe/{token}/manage-link`, in the API's links group, so a check meant for the signup forms, such as CSRF, no longer stops a server that calls with the unsubscribe token from a mail; `requestManageLink({ email })` is unchanged. Needs an API that has the route
- The default `onUnavailable` logs `not-configured` with `console.warn` instead of `console.error`: a deploy without the API URL is an expected state

## v0.3.0 - 2026-10-10

### Breaking

- `updatePurposes()` takes choices without wording `text` (a version, or a version with `locale` and `hash`), and `consent.chooseWithHash()` returns that type: the preference page never takes text, so passing it is now a type error instead of a `422`.

  ```ts
  // 0.2.0: compiled, and the API answered 422
  await waitlist.updatePurposes(token, consent.choose({ version }));

  // 0.3.0
  await waitlist.updatePurposes(token, await consent.chooseWithHash({ version }));
  ```

### Upgrading from 0.2.0

- Render, then act: a confirm or unsubscribe page that called `confirm()` or `unsubscribe()` while it rendered let mail scanners act for the person. Render the state with `confirmation()` or `unsubscription()` and let a button call `confirm()` or `unsubscribe()`; the API acts only on `POST`.
- A `404` without an `error` is `unavailable` with `http-404`, no longer `not_found`: a branch on `not_found` no longer catches a wrong URL, routes that are switched off or the gate.
- The browser example sends the challenge in `X-Waitlist-Challenge`, the header the API's `SpamProtector` reads.

### Changes

- A `404` the API does not name with an `error` is `unavailable` with `http-404` instead of `not_found`, so it is reported rather than looking like an invalid link: a URL without the routes' prefix, routes that are switched off (`WAITLIST_ROUTES_ENABLED`, off by default) or the `useWaitlist` gate keeping the caller from the project
- `headers` and `credentials` options, and `headers` per request: for CSRF, a challenge token or anything else the API checks on its forms
- `createWaitlistClient()` throws a `WaitlistConfigurationError` when it is given a token in a browser
- `unsubscription()`: the state of an unsubscribe link (`GET /unsubscribe/{token}`) without unsubscribing, with `invalid` only for a malformed `purpose`; render the page with it and let a button call `unsubscribe()`
- The `conflict` result of `updatePurposes()` gains a `reason`: `"not_subscribed"` once the address has left, `"list_unavailable"` when the list was removed, or `null`
- Docs: the confirm and unsubscribe page examples render with `confirmation()` and a button instead of acting on render, as mail scanners follow every link; a repeated `confirm()` answers `confirmed` only while the API holds the link
- Docs: the challenge header in the browser example is `X-Waitlist-Challenge`, the one the API's `SpamProtector` reads, and only `subscribe()` and `requestManageLink({ email })` are checked; plus the CSRF, origin check and CORS settings a browser needs (`Retry-After` in `exposed_headers`, or `retryAfter` is `null`)
- Docs: what the statuses without a name mean (`401`, `403`, `404` without `error`, `419`, `422`, `429`, `500`), the preference page flow, and PHP 8.3+ and Laravel 13 for the API

## v0.2.0 - 2026-10-10

- `createWaitlistClient()`: every route of the Laravel Waitlist HTTP API, each resolving to a typed result with a `status` and never throwing; failures report only the operation, a reason and for network errors the runtime's error code, never the token or personal data
- `unsubscribe()` resolves to `invalid` only when it withdraws one purpose, so leaving the list needs no branch for it
- A `404` the API does not name with an `error`, such as Laravel's for a route that does not exist, is `unavailable` with `http-404` instead of `not_found`, so a URL without the routes' prefix is reported rather than looking like an invalid link
- `@taldres/laravel-waitlist/next`: `visitorIp()` from the request headers, `createWaitlistClientFromEnv()` reading `WAITLIST_API_URL` and `WAITLIST_API_TOKEN` per request, with an optional `path` for a URL that holds the API's base, and opting out of the Next.js cache, guarded by `server-only`
- `@taldres/laravel-waitlist/next` also loads in plain Node.js, e.g. in a test runner, not only through the Next.js bundler

## v0.1.0 - 2026-10-10

- `createWaitlistClient()`: every route of the Laravel Waitlist HTTP API, each resolving to a typed result with a `status` and never throwing; failures report only the operation and a reason, never the token or personal data
- `defineConsent()`: versioned consent wording where the site shows it, sent with its text for projects that take wording from their servers, or with its SHA-256
- Forwards the visitor's address for the API's per-visitor rate limit, only when it is an IP address
- `@taldres/laravel-waitlist/next`: `visitorIp()` from the request headers, `createWaitlistClientFromEnv()` reading `WAITLIST_API_URL` and `WAITLIST_API_TOKEN` per request and opting out of the Next.js cache, guarded by `server-only`
- Runs in Node.js, edge runtimes and browsers; tested in Node and the Edge runtime
