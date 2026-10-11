# Release Notes

## [Unreleased](https://github.com/Taldres/laravel-waitlist-js/commits/main/compare/v0.1.2...HEAD)

- `createWaitlistClient()`: every route of the Laravel Waitlist HTTP API, each resolving to a typed result with a `status` and never throwing; failures report only the operation, a reason and for network errors the runtime's error code, never the token or personal data
- `defineConsent()`: versioned consent wording where the site shows it, sent with its text for projects that take wording from their servers, or with its SHA-256
- `unsubscribe()` resolves to `invalid` only when it withdraws one purpose, so leaving the list needs no branch for it
- A `404` the API does not name with an `error` is `unavailable` with `http-404` instead of `not_found`, so it is reported rather than looking like an invalid link: a URL without the routes' prefix, routes that are switched off (`WAITLIST_ROUTES_ENABLED`, off by default) or the `useWaitlist` gate keeping the caller from the project
- `requestManageLink({ token })` posts to `/unsubscribe/{token}/manage-link`, in the API's links group, so a check meant for the signup forms, such as CSRF, no longer stops a server that calls with the unsubscribe token from a mail; `requestManageLink({ email })` is unchanged. Needs an API that has the route
- The default `onUnavailable` logs `not-configured` with `console.warn` instead of `console.error`: a deploy without the API URL is an expected state
- An `invalid` result carries `reason: "spam_check_failed"` when the API's bot check refused the request, so a client can ask for a new challenge without matching the message; it is absent for validation errors
- A request that the API refuses because the project does not list the browser's website (`origins()`, laravel-waitlist) is `unavailable` with `http-403`
- `headers` and `credentials` options, and `headers` per request: for CSRF, a challenge token or anything else the API checks on its forms
- `createWaitlistClient()` throws a `WaitlistConfigurationError` when it is given a token in a browser
- Forwards the visitor's address for the API's per-visitor rate limit, only when it is an IP address
- `@taldres/laravel-waitlist/next`: `visitorIp()` from the request headers, `createWaitlistClientFromEnv()` reading `WAITLIST_API_URL` and `WAITLIST_API_TOKEN` per request, with an optional `path` for a URL that holds the API's base, and opting out of the Next.js cache, guarded by `server-only`
- Runs in Node.js, edge runtimes and browsers; tested in Node and the Edge runtime
- `@taldres/laravel-waitlist/next` also loads in plain Node.js, e.g. in a test runner, not only through the Next.js bundler
- `unsubscription()`: the state of an unsubscribe link (`GET /unsubscribe/{token}`) without unsubscribing, with `invalid` only for a malformed `purpose`; render the page with it and let a button call `unsubscribe()`
- The `conflict` result of `updatePurposes()` gains a `reason`: `"not_subscribed"` once the address has left, `"list_unavailable"` when the list was removed, or `null`
- `updatePurposes()` takes choices without wording `text` (a version, or a version with `locale` and `hash`), and `consent.chooseWithHash()` returns that type: the preference page never takes text, so passing it is now a type error instead of a `422`. A breaking change before 1.0
- Docs: the confirm and unsubscribe page examples render with `confirmation()` and a button instead of acting on render, as mail scanners follow every link; a repeated `confirm()` answers `confirmed` only while the API holds the link
- Docs: the challenge header in the browser example is `X-Waitlist-Challenge`, the one the API's `SpamProtector` reads, and only `subscribe()` and `requestManageLink({ email })` are checked; plus the CSRF, origin check and CORS settings a browser needs (`Retry-After` in `exposed_headers`, or `retryAfter` is `null`)
- Docs: what the statuses without a name mean (`401`, `403`, `404` without `error`, `419`, `422`, `429`, `500`), the preference page flow, and PHP 8.3+ and Laravel 13 for the API
- A `challenge` request option sends the proof of a bot check in `X-Waitlist-Challenge`, the header the API's `SpamProtector` reads, instead of a hand-written header
- `confirmation()` types the entry of an `ok` result as `pending` or `confirmed`: a confirm link answers `404` for a person who has left, and the client refuses an `unsubscribed` entry as an `invalid-response`. Code that branches on `entry.status` there loses a case it never reached
- `requestManageLink()` resolves to `manage_links_disabled` when the API answers `404` with that `error`, a project without manage links, instead of an `unavailable` result with `http-404` that was logged as a failure

## [v0.1.2](https://github.com/Taldres/laravel-waitlist-js/commits/main/compare/v0.1.1...v0.1.2) - 2026-10-11

<!-- Release notes generated using configuration in .github/release.yml at main -->
### What's Changed

#### Breaking Changes

* feat!: changes from the first integration by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/4

#### Enhancements

* feat: send headers and credentials, and keep tokens out of browsers by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/10

#### Bug Fixes

* fix: report a 404 the API does not name as unavailable by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/5
* fix(next): import next/headers with its extension by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/9

#### Maintenance

* ci: attach the packed tarball to releases by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/2
* test: run the client against a live Laravel Waitlist API by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/7

#### Other Changes

* Skip the contract tests when only docs or agent files change by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/11
* chore: release v0.3.0 by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/12
* feat: log not-configured with console.warn by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/14
* docs: show the confirm button only for a pending entry by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/13
* docs: verify a bot challenge in one place only by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/15
* docs: a repeated confirm answers confirmed until the person has left by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/16
* feat: request a manage link by token on the token's own route by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/17
* ci: take the release version from the tag by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/20
* feat: add a challenge option, and type the entry of a confirmation as open by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/21
* test: run the client against a project that lists its websites by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/19
* feat: expose why the API refused a request as reason on invalid by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/18
* test: redefine waitlist-links in the contract workbench by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/24
* ci: run the contract tests against the API branch of the same name by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/22
* docs: say that consent.choose() needs a caller acting for the project by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/23
* feat: add the manage_links_disabled result to requestManageLink() by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/25
* docs: wrap the confirm page example in Suspense by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/26
* docs: note that the package is in development by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/27
* ci: stage the npm release for approval by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/28

**Full Changelog**: https://github.com/Taldres/laravel-waitlist-js/commits/v0.1.2

## [v0.1.1](https://github.com/Taldres/laravel-waitlist-js/commits/main/compare/main...v0.1.1) - 2026-10-11

<!-- Release notes generated using configuration in .github/release.yml at main -->
### What's Changed

#### Breaking Changes

* feat!: changes from the first integration by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/4

#### Enhancements

* feat: send headers and credentials, and keep tokens out of browsers by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/10

#### Bug Fixes

* fix: report a 404 the API does not name as unavailable by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/5
* fix(next): import next/headers with its extension by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/9

#### Maintenance

* ci: attach the packed tarball to releases by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/2
* test: run the client against a live Laravel Waitlist API by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/7

#### Other Changes

* Skip the contract tests when only docs or agent files change by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/11
* chore: release v0.3.0 by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/12
* feat: log not-configured with console.warn by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/14
* docs: show the confirm button only for a pending entry by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/13
* docs: verify a bot challenge in one place only by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/15
* docs: a repeated confirm answers confirmed until the person has left by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/16
* feat: request a manage link by token on the token's own route by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/17
* ci: take the release version from the tag by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/20
* feat: add a challenge option, and type the entry of a confirmation as open by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/21
* test: run the client against a project that lists its websites by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/19
* feat: expose why the API refused a request as reason on invalid by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/18
* test: redefine waitlist-links in the contract workbench by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/24
* ci: run the contract tests against the API branch of the same name by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/22
* docs: say that consent.choose() needs a caller acting for the project by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/23
* feat: add the manage_links_disabled result to requestManageLink() by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/25
* docs: wrap the confirm page example in Suspense by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/26
* docs: note that the package is in development by @Taldres in https://github.com/Taldres/laravel-waitlist-js/pull/27

**Full Changelog**: https://github.com/Taldres/laravel-waitlist-js/commits/v0.1.1
