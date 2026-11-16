# Roost — SPEC

Status: spec draft 2026-11-15. Nothing built. Clean-slate rebuild of the old FastAPI
analytics/AI/bug service — no API compatibility with it.

## What it is
One self-hosted backend that every game (Expo mobile games, the custom Rust engine
on Steam, web/Capacitor builds) talks to through a small SDK. Covers analytics,
an AI proxy in front of OpenRouter, bug + crash reporting, and the live-ops basics
(remote config, identity, purchases). Everything is reachable through a documented
HTTP API so dashboards, scripts, bots and an MCP server can use the same data.

## Stack
- **API:** TypeScript, Hono on Node 22, Zod for validation, OpenAPI generated from routes.
- **DB:** two stores, each for what it's good at.
  - **Postgres 16** (Drizzle ORM + migrations): everything relational and
    updatable — accounts, orgs, games, keys, config, issues, templates.
  - **ClickHouse 26.8** (`@clickhouse/client`, SQL migrations): high-volume,
    append-only data — events now; crash occurrences, AI call logs and perf
    telemetry later. Retention and funnels use its built-in `retention()` and
    `windowFunnel()`, so no rollup tables are needed for them.
  - Retries are deduplicated by `ReplacingMergeTree` on event id during
    background merges, so exact counts use `uniqExact(id)` or `FINAL`.
- **Jobs:** pg-boss (Postgres-backed queue) — no Redis needed in v1.
- **Blob storage:** S3-compatible (RustFS on the box, or R2) for screenshots,
  logs, save files, crash dumps.
- **Dashboard:** Next.js + Tailwind (later phase; API first).
- **Deploy:** Docker Compose on Andrew's own server.

## Project structure
One monorepo: pnpm workspaces + Turborepo. The Rust SDK sits in the same repo
but is built by Cargo, not pnpm.

```
/
├─ apps/
│  ├─ api/          Hono HTTP server: /v1 (games/SDKs) + /admin (dashboard)
│  ├─ worker/       pg-boss jobs: rollups, AI triage, alerts, symbolication, cleanup
│  ├─ dashboard/    React SPA (Vite + TanStack Router/Query + Tailwind + shadcn/ui)
│  └─ mcp/          MCP server over the query API (later)
├─ packages/
│  ├─ db/           Postgres: Drizzle schema, migrations, client (api + worker)
│  ├─ clickhouse/   ClickHouse: client, SQL migrations + runner (api + worker)
│  ├─ core/         business logic shared by api + worker (analytics, ai, bugs…)
│  ├─ contracts/    Zod schemas for every /v1 payload → types + OpenAPI
│  ├─ sdk-js/       published SDK for Expo + web/Capacitor
│  └─ config/       shared tsconfig / eslint / prettier
├─ sdks/
│  └─ rust/         roost-sdk crate for the custom engine
├─ examples/
│  ├─ expo-demo/    test game for the JS SDK
│  └─ rust-demo/    test binary for the Rust SDK
├─ infra/
│  ├─ docker-compose.yml        postgres, clickhouse, s3 (rustfs), api, worker, caddy
│  ├─ docker-compose.dev.yml    postgres + clickhouse + s3 only, for local dev
│  ├─ Caddyfile
│  └─ Dockerfile.{api,worker,caddy}
└─ docs/
```

Inside `packages/core` (and mirrored in `apps/api/src/routes`), code is grouped
by module, not by layer: `ingest/ analytics/ ai/ bugs/ config/ identity/ purchases/`,
each with its own `routes.ts`, `service.ts`, `schema.ts`, tests.

### Rules
- **Two API surfaces.** `/v1/*` is the public game API: versioned, stable, never
  broken, auth = client key (+ player JWT later). `/admin/*` is dashboard-only:
  free to change, auth = session cookie. Server keys (scripts, MCP) may call
  `/v1/query` and read endpoints.
- **One source of truth for payloads:** `packages/contracts`. The API validates
  with it, the JS SDK imports its types, OpenAPI is generated from it, and the
  Rust SDK's types are checked against that OpenAPI in CI.
- **Dashboard ↔ API is typed** through Hono's RPC client (`hc<AdminApp>`), so a
  changed route breaks the dashboard build, not production.
- **API never does slow work inline.** Ingest writes and returns 202; rollups,
  AI triage, alerts, symbolication run in `worker`.
- **One domain in prod:** Caddy serves the dashboard's static build at `/`,
  proxies `/v1` and `/admin` to the API. Same origin → simple cookies, no CORS
  for the dashboard. (SDKs are cross-origin and use keys, so CORS is open on `/v1` only.)

## Code rules
These are enforced in CI where possible (`pnpm check:structure`, lint, typecheck)
and copied into the repo's `CLAUDE.md` / `AGENTS.md` so agents follow them too.

### Size and layout
- **≤ 500 lines per file**, hard limit (CI fails). Aim for under 300.
- **≤ 5 source files per folder.** A sixth file means splitting into subfolders
  by concept, and every subfolder follows the same rule.
  Exempt: generated files (Drizzle migrations, OpenAPI output), repo-root
  config files, `__tests__/` folders.
- Tests live in a `__tests__/` folder next to the code they test, so they don't
  eat the 5-file budget.
- **Group by feature, not by layer.** `bugs/grouping/fingerprint.ts`, not
  `services/bugService.ts`.
- Each feature folder has an `index.ts` that is its public surface. Other
  features import from `index.ts` only — no deep imports into another
  feature's internals (lint rule).
- Functions ≤ ~50 lines, React components ≤ ~200 lines. Longer = split.
- Files: `kebab-case.ts`; React components `PascalCase.tsx`; one main export
  per file, named the same as the file.

### TypeScript
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on.
- No `any`, no `@ts-ignore`; `as` casts and `!` only with a comment saying why.
- Named exports only (no default exports, except where a framework needs one).
- No barrel files except a feature's single `index.ts`.

### API and data
- **Every input validated with Zod at the edge** (body, query, params, headers,
  env). Nothing from a client is trusted.
- **Every query is scoped by `game_id`/`org_id`** through a tenant helper; a raw
  query without a scope fails review. One game must never see another's data.
- **`/v1` changes are additive only.** New optional fields and new endpoints are
  fine; renames, removals and new required fields need a `/v2`.
- One error shape everywhere: `{ "error": { "code": "rate_limited", "message": "…" } }`.
  Code throws typed `AppError`s; one handler turns them into responses.
- All public endpoints are rate-limited.
- Timestamps stored as UTC `timestamptz`. Money stored as integer cents + currency.
- Migrations are append-only: never edit one that has been applied anywhere.
- Slow work (>~100 ms, or anything calling a third party except the AI proxy's
  live request) goes to the worker, not inline in a request.

### Security and privacy
- Secrets only from env, parsed with Zod at startup; the process refuses to
  start if one is missing or malformed.
- Never log secrets, OTP codes, API keys, emails or raw IPs. Structured logs
  (pino) with a request ID on every line.
- Store hashes, not raw values, for OTP codes, session tokens and API keys.

### Dashboard
- Data fetching only through per-feature TanStack Query hooks
  (`features/issues/api/use-issues.ts`); components never call `fetch`.
- Shared primitives in `components/ui` (shadcn); feature UI stays in its feature.
- Every page handles loading, empty and error states.

### Rust SDK
- `cargo clippy -- -D warnings`, `cargo fmt`. No `unwrap`/`expect`/`panic!` in
  library code — the SDK must never crash the game. Same file/folder limits.

### Process
- Every route gets an integration test; every bug fix gets a regression test.
- New dependencies need a reason in the PR; versions are pinned (lockfiles committed).
- Conventional commits (`feat:`, `fix:`, `chore:`…). Small PRs.
- CI gates: typecheck, lint, tests, structure check, OpenAPI drift check,
  changelog check.
- Comments explain *why*, not *what*.

### Changelog
Format: [Keep a Changelog](https://keepachangelog.com) + Semantic Versioning.

- **Where:** root `CHANGELOG.md` covers the server (api, worker, dashboard).
  Each published SDK has its own, because they ship on their own schedule:
  `packages/sdk-js/CHANGELOG.md`, `sdks/rust/CHANGELOG.md`.
- **Every change that someone could notice gets an entry in the same PR**,
  under `## [Unreleased]`. CI fails a PR that touches `apps/`, `packages/` or
  `sdks/` without a changelog edit, unless it has the `skip-changelog` label
  (refactors, tests, CI-only changes).
- **Sections, in this order, only when used:** Added · Changed · Deprecated ·
  Removed · Fixed · Security.
- **One line per entry, written for the person using it** (a game dev calling
  the API, someone in the dashboard) — what changed and why it matters, not
  how the code changed. Not a copy of the commit message.
- **Start each entry with its area in bold:** `**api**`, `**dashboard**`,
  `**worker**`, `**ai**`, `**bugs**`… and end with the PR link.
- **Breaking changes start with `**BREAKING**`** and say what to do about it
  (one line, or a link to a migration note in `docs/`).
- Anything that touches auth, keys, OTP, rate limits or data exposure goes under
  **Security**.
- **Releasing:** rename `[Unreleased]` to `[x.y.z] - YYYY-MM-DD`, add a fresh
  empty `[Unreleased]`, tag `vX.Y.Z` (SDKs: `sdk-js-vX.Y.Z`, `sdk-rust-vX.Y.Z`).
- Released entries are never edited afterwards; corrections go in a new entry.
- Versions: `0.x` until the first game ships on it. After 1.0, a breaking change
  to `/v1` is never allowed (it becomes `/v2`); a breaking SDK change is a major bump.

### Local dev
`docker compose -f infra/docker-compose.dev.yml up` (Postgres + ClickHouse + RustFS), then `pnpm db:migrate`, then
`pnpm dev` runs api, worker and dashboard together via Turbo with hot reload.
Vite proxies `/v1` and `/admin` to the API so dev matches prod's single origin.

### Testing
Vitest everywhere. API/worker integration tests run against real Postgres
and ClickHouse (they create their own rows and clean up), not mocks. SDK tests run against the API in CI.

### Dashboard pages
Overview · Events explorer · Retention · Funnels · Players (lookup) ·
AI (templates editor, usage + cost) · Issues (list, detail with breadcrumbs,
stack, affected builds) · Reports inbox · Config & flags · Settings
(games, environments, keys, members, integrations).

## SDKs
| SDK | Covers | Notes |
|---|---|---|
| `@roost/sdk` (TypeScript) | Expo (React Native) + web/Capacitor | Offline queue in AsyncStorage / localStorage; Expo crash hooks via `ErrorUtils` + native crash handler |
| `roost-sdk` (Rust crate) | Custom Rust engine (Steam desktop) | Panic hook + minidump for native crashes; Steam auth ticket via steamworks-rs |

Both SDKs: batch + gzip events, retry with backoff, persist the queue across launches,
attach a common context (game, build, platform, device, session, player).

## Core concepts
- **Org → Game → Environment** (dev / staging / prod). Each environment has a
  public **client key** (shipped in builds, low privilege) and **server keys**
  (secret, for dashboards/scripts/MCP).
- **Player:** anonymous install ID first; can link Steam ID, Apple Game Center,
  Google Play, or email. One player across devices.
- **Session:** started by the SDK, heartbeat while open, ended on background/quit.
- **Build:** version + build number + platform; everything (events, crashes,
  config) is tagged with it.

## Modules

### 1. Ingest + Analytics (v1)
- `POST /v1/events` — batched (≤500 events, ≤1 MB gzip), idempotent per event ID.
- Automatic events: `session_start`, `session_end`, `first_open`, `app_update`.
- Custom events: name + free-form props (JSON) + optional numeric `value`.
- Built-in metrics: DAU/WAU/MAU, new players, sessions/player, session length,
  D1/D7/D30 retention cohorts, funnels, breakdowns by build/platform/country/device.
- **Query API** (server key): `POST /v1/query` with a small JSON query language
  (metric, filters, group-by, time range, granularity) + saved queries. A raw SQL
  endpoint against a read-only replica role, for power use.
- Rollups computed by jobs into daily tables so dashboards stay fast.

### 2. AI Proxy — OpenRouter (v1)
- Clients never see the OpenRouter key.
- **Templates live on the server:** client calls
  `POST /v1/ai/run {template: "coach_chat", vars: {...}, stream: true}`.
  Templates hold the system prompt, model, fallback models, max tokens, temperature,
  output schema (optional JSON mode). Editable without a game update; versioned.
- Optional raw `POST /v1/ai/chat` gated to server keys only.
- Limits: per-player rate limit + daily token budget, per-game monthly spend cap;
  hitting a cap returns a clean error the game can handle.
- Model fallback on error/timeout; response cache for identical template+vars;
  input moderation on player-written text.
- Usage log per call: game, player, template, model, tokens in/out, cost, latency,
  status. Cost dashboards per game/template/model.
- Streaming via SSE.

### 3. Bug Reports + Crashes (v1)
- **Player reports:** `POST /v1/reports` — text, category, screenshot, logs,
  device info, build, optional save file (upload via presigned URL).
- **Automatic crashes:** JS errors + native crashes (Expo), panics + minidumps
  (Rust). Each report carries the **last 50 analytics events** as breadcrumbs.
- **Grouping:** fingerprint from normalized stack trace → Issue. Counts, first/last
  seen, affected builds, affected players, regressions (issue reappears after resolve).
- **Symbolication:** upload source maps (Expo/web) and debug symbols (Rust) per build.
- **AI triage** (uses module 2): summary, likely cause, severity guess, duplicate
  detection for player reports.
- **Outbound:** new issue / spike / regression → Discord webhook and/or Linear issue.

### 4. Remote Config + Flags (v2)
- Key/value config per environment, with targeting rules (build, platform,
  country, player segment, % rollout). SDK fetches on launch, caches, falls back
  to bundled defaults.
- A/B tests: assign variant, log exposure event, compare metrics in analytics.
- **Kill switches:** minimum supported build (force update), maintenance mode,
  in-game announcements / MOTD.

### 5. Accounts (dashboard: v1, players: v2)
No Google / Apple / Game Center / Play Games sign-in. Everything is **email + one-time code**.

**Shared OTP flow** (one implementation, used by both):
- `POST …/otp/start {email}` → emails a 6-digit code. Always returns 200, so it
  can't be used to check whether an email exists.
- `POST …/otp/verify {email, code}` → session.
- Code: 10-minute expiry, single use, stored hashed, max 5 wrong tries then dead.
- Rate limits: 3 sends per 15 min per email, plus per-IP limits.
- Email sent through a provider set in env (Resend or plain SMTP). Sent inline by
  the API, not the worker, so the raw code never sits in the job table.
- Dev uses Mailpit: every email lands in the inbox at http://localhost:8025.
- Codes are stored as HMAC-SHA256 keyed by `AUTH_SECRET` (a 6-digit code is too
  small a space for a plain hash), bound to the email address.
- **Who can sign up:** `SIGNUP_ALLOWLIST` (`a@b.com`, `@b.com`, or `*`). Existing
  users can always sign in. A not-allowed email gets the same "check your inbox"
  answer but no email, so the form can't be used to find accounts.

**Dashboard users (v1):** OTP sign-up and login. Session = random token in an
httpOnly, Secure, SameSite=Lax cookie, stored hashed, 30-day absolute + 7-day idle
expiry, revocable. `/admin` also rejects cross-site form posts (CSRF). Orgs invite members by email; roles: owner / dev / viewer.

**Players (v2):** start anonymous (install ID). Optionally link an email with OTP
to keep progress across devices. Steam builds also verify the Steam auth session
ticket server-side (no extra login for the player — Steam already did it).
Backend issues a short-lived player JWT used for AI, saves and purchases.
Ban list by player / device / Steam ID.

### 6. Purchases (v2)
- Receipt validation: App Store Server API, Google Play Developer API,
  Steam microtransactions (if used).
- Server notifications (App Store S2S, Play RTDN) for refunds/renewals.
- Revenue metrics: ARPDAU, payer conversion, LTV by cohort.

### 7. Expo OTA updates (v3)
Self-hosted server for the Expo Updates protocol, replacing EAS Update.
- Upload the output of `expo export` per channel + `runtimeVersion`
  (CLI script / CI step); assets stored in S3-compatible storage.
- Manifest endpoint the `expo-updates` client points at; code signing so
  apps only accept bundles we signed.
- Channels (production / staging), % rollouts, instant rollback.
- Tied into the rest: adoption per update in analytics, crash rate per update ID
  in Issues, auto-pause a rollout when its crash rate spikes.

### 8. Later
- Cloud saves (versioned, conflict detection).
- Leaderboards.
- Push notifications (Expo push service for mobile).
- Performance telemetry: FPS, frame-time percentiles, load times, memory by device.
- Player feedback surveys / rating prompts.

### Cross-cutting
- **Privacy:** consent flags in the SDK; `DELETE /v1/players/:id` and export
  endpoint (GDPR); IP not stored raw (country lookup then drop); iOS ATT respected.
- **Dashboard:** game switcher, overview, retention, funnels, AI spend, issues,
  config editor.
- **MCP server** on top of the query API: events summary, retention, AI usage,
  bug counts/issue details, config read — so Claude can answer "why did D1
  drop on build 1.4?"

## Build order
1. Repo, Compose (API + Postgres + ClickHouse + RustFS), structure check in CI, dashboard
   OTP login, orgs/games/keys, ingest endpoint, TS SDK with offline queue.
   Test in one Expo game.
2. Analytics rollups + query API + retention/funnels.
3. AI proxy (port Chrona FC's OpenRouter client as the core).
4. Bug reports + crash grouping + Discord/Linear outbound; Rust crate SDK.
5. Minimal dashboard + MCP server.
6. Remote config / flags / kill switches.
7. Player accounts (email OTP, Steam ticket), purchases.
8. Expo OTA updates.

## Open questions
- ~~Product name~~ — decided: **Roost**.
- Host/domain and whether it runs on the existing dev server.
- Discord, Linear, or both for bug outbound?
- Do any Steam games sell in-game items (needs Steam microtransactions)?
- Expected event volume (sizes the ClickHouse server and retention TTL).
