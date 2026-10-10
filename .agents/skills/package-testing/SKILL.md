---
name: package-testing
description: "Use this skill when writing, changing or reviewing tests of @taldres/laravel-waitlist with Vitest: client behavior against a fake fetch, result mapping per status code, consent definitions, the Next.js helpers, type tests and the 100% coverage threshold in Node and the Edge runtime."
license: MIT
metadata:
    author: taldres
---

# Package Testing

## Primary Goal

Prove what consumers rely on: the request each method sends, the result each answer of the API becomes, and the types they narrow on.

## Workflow

1. Start from the API: read the route, payload and status codes in taldres/laravel-waitlist (`docs/reference/http-api.md`, the controllers), then write the failing test.
2. Test the client through `fakeApi()` in `tests/helpers.ts`: it records each request and answers with what the test returns. Answer as the API does, including the `error` of its own refusals. Never call a real API from `tests/`.
3. Cover every status a method maps, the `unavailable` paths (no answer, timeout, abort, unexpected status, a body that does not fit) and that nothing sensitive reaches `onUnavailable` or the console.
4. Add type tests in `tests/*.test-d.ts` with `expectTypeOf` and `@ts-expect-error` for public types consumers narrow on.
5. Run `pnpm test:coverage`: the `node` and `edge` projects both run every `tests/**/*.test.ts` except `tests/next/**`, which mocks `next/headers` and `server-only` and runs in Node only.
6. Add every route and status to `contract/api.test.ts` too. It runs the client against the API from taldres/laravel-waitlist `main`, served by Testbench on SQLite as an app would run it: debug off, `JsonResource::withoutWrapping()` on, a project token, the visitor's address forwarded. `contract/workbench` captures the tokens a mail would carry and lets a test move the clock with `X-Contract-Now`.

## References

- `vitest.config.ts`: the two projects and the coverage thresholds
- `tests/helpers.ts`: `fakeApi()`, `json()`, the entry fixtures
- `tests/results.test.ts`: the status table per method
- `tests/next/next.test.ts`: mocking Next.js
- `contract/`: the live API for `pnpm test:contract`, and `.github/workflows/contract.yml`

## Anti-Patterns

- Lowering a coverage threshold instead of testing the branch.
- Asserting on implementation details instead of the request sent and the result returned.
- Tests that only pass in Node: the client must also work in edge runtimes.
- Logging or snapshotting a token, header or address in a test.
