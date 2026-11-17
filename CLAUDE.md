# Roost — rules for anyone (human or agent) working in this repo

Roost is a self-hosted backend for our games: analytics, an OpenRouter AI proxy,
bug/crash reports, and live-ops. Full design: `SPEC.md`. Read it before big changes.

## Layout
- `apps/api` Hono server · `apps/worker` background jobs · `apps/dashboard` React SPA
- `packages/db` Postgres (Drizzle) · `packages/clickhouse` ClickHouse client + SQL migrations · `packages/core` shared logic
- `packages/contracts` Zod schemas for every `/v1` payload · `packages/sdk-js` Expo/web SDK
- `sdks/rust` Rust SDK crate · `infra/` Docker Compose, Caddy, Dockerfiles

## Hard limits (CI fails: `pnpm check:structure`)
- **≤ 500 lines per file.** Aim for under 300.
- **≤ 5 source files per folder** inside `src/`. A sixth file means: split into
  subfolders by concept. Subfolders follow the same rule.
- Tests go in a `__tests__/` folder next to the code (exempt from the 5-file count).

## Code
- Group by feature, not by layer. Each feature folder exposes an `index.ts`;
  other features import only from that, never from its internals.
- Functions ≤ ~50 lines, React components ≤ ~200 lines.
- Files `kebab-case.ts`, components `PascalCase.tsx`. Named exports only.
- TypeScript strict. No `any`, no `@ts-ignore`. `as` / `!` only with a comment saying why.
- Comments explain *why*, not *what*.

## API and data
- Validate every input with Zod at the edge (body, query, params, headers, env).
- Every DB query is scoped by `org_id` / `game_id`. One game never sees another's data.
- `/v1` (games, SDKs) is **additive only**. `/admin` (dashboard) may change freely.
- Errors: throw `AppError`; responses are always `{ "error": { "code", "message" } }`.
- Rate-limit every public endpoint. Timestamps UTC `timestamptz`; money = integer cents.
- Events and other append-only, high-volume data go to ClickHouse; everything else to Postgres.
- Migrations (both stores) are append-only. Never edit one that has been applied.
- Slow work goes to the worker, not inline in a request. Exceptions: the AI proxy's live
  call, and sign-in and invite emails (the raw code or token must never sit in the job table).

## Security
- Secrets only from env, parsed with Zod at startup (fail fast).
- Never log secrets, OTP codes, API keys, emails or raw IPs.
- Store hashes of OTP codes, session tokens and API keys, never raw values.

## Dashboard
- Data fetching only through per-feature TanStack Query hooks; components never call `fetch`.
- Every page handles loading, empty and error states.

## Rust SDK
- `cargo fmt`, `cargo clippy -- -D warnings`. No `unwrap` / `expect` / `panic!` in
  library code: the SDK must never crash the game.

## Process
- Every route gets an integration test; every bug fix gets a regression test.
- New dependencies need a reason; lockfiles are committed.
- Conventional commits (`feat:`, `fix:`, `chore:` …). Small PRs.
- Before finishing: `pnpm check` (structure, lint, typecheck, tests).

## Changelog (`CHANGELOG.md`, plus one per SDK)
- Every change someone could notice gets an entry under `## [Unreleased]` in the same PR.
- Sections: Added · Changed · Deprecated · Removed · Fixed · Security.
- One line, written for the user of the API/SDK/dashboard, starting with the area
  in bold (`**api**`, `**dashboard**`…), ending with the PR link.
- Breaking changes start with `**BREAKING**` and say what to do.
- Released entries are never edited. Full rules: `SPEC.md` → "Changelog".
