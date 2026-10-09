# Contribution Guide

Thank you for considering contributing to Laravel Waitlist JS! Please review the following guidelines before submitting a pull request.

For significant changes, please open an issue first so we can discuss the approach.

## Scope

This package is the client side of [taldres/laravel-waitlist](https://github.com/Taldres/laravel-waitlist)'s HTTP API and nothing more: it mirrors the API's routes, payloads and answers, and adds what Next.js needs to call it from a server. Forms, styling, bot protection and rate limiting per visitor stay in your application.

A change to the API belongs in the PHP package first; the client follows it.

## Process

1. Fork the project
2. Create a new branch
3. Code, test, commit, and push
4. Open a pull request detailing your changes

## Guidelines

- Run `pnpm check` before you push; CI runs the same.
- Add tests for behavior changes. Coverage stays at 100%.
- Keep code, comments, and docs in English. Comments only explain a non-obvious why.
- Use [Conventional Commits](https://www.conventionalcommits.org/) and send a coherent history, making sure each commit in your pull request is meaningful.
- You may need to [rebase](https://git-scm.com/book/en/v2/Git-Branching-Rebasing) to avoid merge conflicts.
- Please remember that we follow [SemVer](https://semver.org/).

## Setup

Clone your fork, then install the dependencies with the pnpm version from `packageManager` (Corepack picks it up):

```bash
pnpm install
```

## Checks

Everything CI runs, in order:

```bash
pnpm check
```

Or one step at a time:

```bash
pnpm format         # Prettier
pnpm lint           # ESLint with type information
pnpm typecheck      # tsc
pnpm test           # Vitest in Node and in the Edge runtime, plus type tests
pnpm test:coverage  # the same, failing below 100% coverage
pnpm build          # tsdown into dist/
pnpm lint:package   # publint and Are the Types Wrong on the packed package
```

`pnpm test:watch` keeps Vitest running while you work.
