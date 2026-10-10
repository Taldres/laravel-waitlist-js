# Release Notes

## [Unreleased](https://github.com/Taldres/laravel-waitlist-js/commits/main)

- `createWaitlistClient()`: every route of the Laravel Waitlist HTTP API, each resolving to a typed result with a `status` and never throwing; failures report only the operation, a reason and for network errors the runtime's error code, never the token or personal data
- `defineConsent()`: versioned consent wording where the site shows it, sent with its text for projects that take wording from their servers, or with its SHA-256
- `unsubscribe()` resolves to `invalid` only when it withdraws one purpose, so leaving the list needs no branch for it
- A `404` the API does not name with an `error`, such as Laravel's for a route that does not exist, is `unavailable` with `http-404` instead of `not_found`, so a URL without the routes' prefix is reported rather than looking like an invalid link
- `headers` and `credentials` options, and `headers` per request: for CSRF, a challenge token or anything else the API checks on its forms
- `createWaitlistClient()` throws a `WaitlistConfigurationError` when it is given a token in a browser
- Forwards the visitor's address for the API's per-visitor rate limit, only when it is an IP address
- `@taldres/laravel-waitlist/next`: `visitorIp()` from the request headers, `createWaitlistClientFromEnv()` reading `WAITLIST_API_URL` and `WAITLIST_API_TOKEN` per request, with an optional `path` for a URL that holds the API's base, and opting out of the Next.js cache, guarded by `server-only`
- Runs in Node.js, edge runtimes and browsers; tested in Node and the Edge runtime
- `@taldres/laravel-waitlist/next` also loads in plain Node.js, e.g. in a test runner, not only through the Next.js bundler
