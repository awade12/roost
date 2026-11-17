# Contributing to Roost

Thanks for helping. Roost is a self-hosted backend for games: analytics, crash and bug
reports, an AI proxy, and live-ops. This page covers how to get it running, the rules the
code follows, and how a change gets in.

Before a big change, read [SPEC.md](SPEC.md) (the design) and open an issue to talk it
through. Small fixes can go straight to a pull request.

## Set up

You need:

- **Node 26** (22 is the minimum, see `engines` in `package.json`)
- **pnpm 12** (`corepack enable` picks the version in `package.json`)
- **Docker**, for Postgres, ClickHouse, RustFS (S3) and Mailpit
- **Rust** (stable, with `rustfmt` and `clippy`), only if you work on the Rust SDK

```bash
cp .env.example .env
pnpm i
pnpm db:up        # Postgres, ClickHouse, RustFS and Mailpit in Docker
pnpm db:migrate   # both databases
pnpm dev          # api :8787, dashboard :5173, worker
```

Sign in at http://localhost:5173 with any email; the code arrives in Mailpit at
http://localhost:8025.

## Layout

| Path | What |
|---|---|
| `apps/api` | Hono server (`/v1` for games and SDKs, `/admin` for the dashboard) |
| `apps/worker` | Background jobs |
| `apps/dashboard` | React SPA |
| `packages/db` | Postgres (Drizzle) |
| `packages/clickhouse` | ClickHouse client and SQL migrations |
| `packages/core` | Shared logic |
| `packages/contracts` | Zod schemas for every `/v1` payload |
| `packages/sdk-js` | JS SDK for Expo and web (`@roost/sdk`) |
| `sdks/rust` | Rust SDK (`roost-sdk`) |
| `infra/` | Docker Compose, Caddy, Dockerfiles |

## Rules

The full list is in [CLAUDE.md](CLAUDE.md) (it's for people and coding agents alike). The ones
you'll hit first:

- **Files ≤ 500 lines** (aim for under 300), and **≤ 5 source files per folder** inside
  `src/`. A sixth file means splitting into subfolders by concept. Tests live in a
  `__tests__/` folder next to the code and don't count. `pnpm check:structure` enforces both.
- Group by feature, not by layer. Other features import only from a feature's `index.ts`.
- TypeScript strict: no `any`, no `@ts-ignore`; `as` or `!` only with a comment saying why.
  Named exports, `kebab-case.ts` files, `PascalCase.tsx` components.
- Validate every input with Zod at the edge. Scope every query by `org_id` / `game_id`.
- `/v1` is **additive only**: games in the wild depend on it. `/admin` may change freely.
- Migrations (Postgres and ClickHouse) are append-only. Never edit one that has been applied.
- Never log secrets, OTP codes, API keys, emails or raw IPs.
- **Rust SDK:** `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, and no `unwrap`,
  `expect` or `panic!` in library code. The SDK must never crash the game.

## Tests

- Every route gets an integration test; every bug fix gets a regression test.
- Integration tests run against real Postgres and ClickHouse (from `pnpm db:up`), not mocks.
- Rust SDK: `cargo test` in `sdks/rust` (add `--features native-crashes` for the minidump tests).

## SDK wire types

The JS SDK ships with no dependencies, so it doesn't import the Zod schemas in
`packages/contracts`. It keeps its own plain TypeScript copies of the payloads in
`packages/sdk-js/src/wire/types.ts`. `packages/sdk-js/src/__tests__/wire.test.ts` checks at
compile time that each one is assignable both ways to its `@roost/contracts` type, so if the
API's contract changes and the SDK's copy doesn't (or the other way round), `pnpm typecheck`
fails. When you add a field to a `/v1` payload, add it to the contract and to `wire/types.ts`.

## Changelog

Every change someone could notice gets a line under `## [Unreleased]` in the same PR: the
root `CHANGELOG.md` for the server, `packages/sdk-js/CHANGELOG.md` and
`sdks/rust/CHANGELOG.md` for the SDKs.

- Sections, in this order, only when used: Added · Changed · Deprecated · Removed · Fixed · Security.
- One line, written for the person using it, starting with the area in bold (`**api**`,
  `**dashboard**`, `**sdk-js**` …) and ending with the PR link.
- Breaking changes start with `**BREAKING**` and say what to do.
- Released entries are never edited.

CI fails a PR that touches `apps/`, `packages/` or `sdks/` without a changelog edit, unless it
has the `skip-changelog` label (refactors, tests, CI-only changes). Full rules: SPEC.md →
"Changelog".

## Pull requests

- Small PRs, one concern each. [Conventional commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`, `docs:` …).
- New dependencies need a reason in the PR; lockfiles are committed.
- Run `pnpm check` (structure, lint, typecheck, tests) before you open it, and the Rust
  checks if you touched `sdks/rust`.
- Fill in the PR template's checklist.

## Security issues

Don't open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## License of contributions

By contributing, you agree that your contribution is licensed under the license of the part
of the repository it goes into:

- the SDKs (`packages/sdk-js`, `sdks/rust`): [MIT](packages/sdk-js/LICENSE)
- everything else: [FSL-1.1-ALv2](LICENSE) (Functional Source License, which becomes
  Apache-2.0 two years after each release)
