# Laravel Waitlist JS

This repository is `@taldres/laravel-waitlist`: the TypeScript client for the HTTP API of [taldres/laravel-waitlist](https://github.com/Taldres/laravel-waitlist), with helpers for Next.js. Keep it small, typed, dependency-free at runtime, and as carefully documented and tested as the PHP package.

## Package Layout

- One package, built the way the Next.js ecosystem builds libraries (`@vercel/analytics`, the AI SDK): subpath exports per framework, tsdown for the build, Vitest for tests.
- `src/` is the framework-agnostic client, exported from `.`. It only uses `fetch`, `AbortSignal` and Web Crypto, so it runs in Node.js, edge runtimes and browsers. Never import Node built-ins or a framework here.
- `src/next/` is `./next`: re-exports the client and adds what needs `next/headers` or `server-only`. `next` stays an optional peer dependency.
- Another framework gets its own subpath next to `next`, never code in the client.

## Package Conventions

- Mirror the PHP package's HTTP API exactly: routes, payloads, status codes and wording follow `docs/reference/http-api.md` there. Change the client when the API changes, not the other way round.
- Every client call resolves to a result union with a `status` and never throws; programmer errors, such as an invalid consent definition, throw at definition time.
- Never log or return the project token, request headers or personal data. Failures report only the operation, a reason and, for network errors, the runtime's error code.
- The project token belongs on servers only. Nothing may make it easy to ship it to a browser.
- `server-only` is the only runtime dependency.
- The README is the documentation: every public export, option and status is in it, and its examples must compile.

## Project Rules

- Code, comments, commit messages and docs are in English. Comments only explain a non-obvious why; public API gets short TSDoc.
- Commits follow Conventional Commits.
- Every behavior change comes with tests. Coverage stays at 100%, in Node and in the Edge runtime.

## Attribution

- Do not add `Co-authored-by:` trailers to commits.
- Do not add any other AI attribution, such as "Generated with ..." lines, to commit messages or pull request descriptions.
- Commits are authored by the configured git user only.

## Quick Commands

- Everything CI runs: `pnpm check`
- Formatting: `pnpm format`, check only `pnpm format:check`
- Lint: `pnpm lint`
- Types: `pnpm typecheck`
- Tests: `pnpm test`, with coverage `pnpm test:coverage`, watching `pnpm test:watch`
- Build: `pnpm build`, then `pnpm lint:package` checks the packed package with publint and Are the Types Wrong
- Contract tests against a live API (PHP 8.3+): `composer --working-dir=contract update` and `composer --working-dir=contract build` once, `composer --working-dir=contract serve`, then `pnpm test:contract`

## Local Skills

- `package-testing`: use when adding or changing tests with Vitest, including type tests, the Edge runtime project and coverage.
- `package-release`: use when preparing a release, the changelog or the publish workflow. Never publish autonomously.
