# Changelog

All notable changes to the Roost server (api, worker, dashboard) are recorded here.
SDKs keep their own changelogs in `packages/sdk-js/` and `sdks/rust/`.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Rules: see "Changelog" in `SPEC.md`.

## [Unreleased]

### Added
- **repo** Monorepo scaffold: pnpm + Turborepo, shared strict TypeScript config, ESLint rules, CI (structure, lint, typecheck, tests, changelog check, Rust fmt/clippy/test).
- **repo** `pnpm check:structure` enforces 500 lines per file and 5 source files per folder.
- **api** Hono server with `/health`, the standard error shape, request IDs and structured logs.
- **api** `POST /v1/events`: batched analytics ingest authenticated by `X-Roost-Key`, 1 MB body limit, rate limit, duplicate-safe retries. Responds `202 { received }`. Events are stored in ClickHouse.
- **api** Dashboard sign-in with emailed 6-digit codes (`/admin/auth/otp/start`, `/admin/auth/otp/verify`, `/admin/auth/logout`) and `/admin/me` with the user's orgs. First sign-in creates the account.
- **dashboard** v2 design (dark, Geist, status-only color; designs in Paper "Roost — Dashboard"): sign-in screen, sidebar with all sections, breadcrumb header, and sign out.
- **dashboard** Overview with metric cards, chart area and a "Send your first events" guide with the SDK snippet. Shows empty states until the analytics API lands.
- **api** Studios, games and keys: `POST /admin/orgs`, `GET`/`POST /admin/orgs/:orgId/games`, `POST /admin/environments/:environmentId/keys`, `DELETE /admin/keys/:keyId`. New games start with production and development environments.
- **dashboard** "Name your studio" first-run screen, and a Games & keys page: create games, create client and server keys (shown once, with copy), and revoke keys.
- **api** `GET /admin/environments/:environmentId/overview?days=7|30|90`: daily players, events and new players (UTC days), 7-day averages with week-over-week change, D1 retention over complete cohorts, and the last 24 hours' top events. Queries ClickHouse directly.
- **dashboard** Overview shows real analytics: metric cards with week-over-week change, daily-players and new-players charts (crosshair tooltip, arrow keys, screen-reader table, today drawn dashed), top events, and a 7d / 30d / 90d range.
- **dashboard** Game and environment picker in the header; the choice is remembered in the browser.
- **repo** `pnpm seed:events <client-key>` sends a realistic month of events through the real ingest API for local development.
- **api** AI proxy: `POST /v1/ai/run {template, vars, playerId}` runs a server-side prompt template through OpenRouter with fallback models. Every call (and refusal) is logged to ClickHouse `ai_calls` with tokens, billed cost and latency. Needs `OPENROUTER_API_KEY`; without it the endpoint answers `503 unavailable`. Streaming is not supported yet.
- **api** AI admin: list/create/edit/delete prompt templates (edits bump the version), per-game limits, and usage (month-to-date spend, requests, median latency, blocked rate, per-template tokens/cost/errors).
- **api** New error codes `unavailable` (503) and `upstream_error` (502).
- **dashboard** AI proxy page: spend against the monthly cap, usage stats, prompt templates table with an editor that shows which variables a template needs, and limits.
- **api** Crash and error reports: `POST /v1/crashes` (up to 20 per call, with recent events as breadcrumbs). Reports are grouped into issues by exception type and top in-app stack frames, ignoring line numbers, addresses and IDs, so one bug stays one issue across builds. Retries are stored once.
- **api** Issues: list per environment with 30-day events and players, detail with the latest stack, breadcrumbs and platform/build breakdowns, and resolve / ignore / reopen. A resolved issue that happens again (after the fix) reopens as regressed.
- **dashboard** Issues page: list grouped into Regressed / New / Ongoing, detail panel with stack trace and the events before the crash, and Resolve / Ignore / Reopen.
- **dashboard** UI kit in `components/ui`: Input (with prefix/suffix), Textarea, Field, a custom keyboard-accessible Select (listbox) with groups and type-to-jump, Switch, Dialog (focus trap, Escape, nested-safe) and ConfirmDialog. Native selects and browser `confirm()` popups are gone.
- **repo** React hooks lint rules for the dashboard (`rules-of-hooks` errors, `exhaustive-deps` warns).
- **repo** `pnpm seed:events` also sends 120 crash reports; `--crashes-only` sends just those.
- **api** Crash reports carry developer-controlled data: `level`, `tags` (up to 50, searchable), `contexts`, `extra` (JSON up to 64 KB), custom breadcrumbs (category, level, message), a `fingerprint` override for grouping, and `kind: "message"` for non-exception reports. All additive to `/v1`.
- **api** Attachments: `PUT /v1/crashes/:crashId/attachments/:attachmentId` (up to 5 per report, 10 MB each; e.g. a player's save file) stored in S3-compatible storage (RustFS locally). Downloads are always served as attachments, never rendered.
- **api** Issue depth: occurrences list and full event detail, tag breakdowns, assignee, labels (per game), comments, and an activity log of every change. Regressions are logged too.
- **api** Linear: connect per studio (key checked, team chosen), then send any issue to Linear with its impact, stack and a link back. Sending twice returns the same Linear issue.
- **dashboard** Full issue page (`/issues/:id`): step through events, copy the stack / event ID / extra JSON / link, breadcrumbs with category and level, tags, contexts, extra, attachment downloads, and a sidebar with status, assignee, labels, Linear, impact, platforms, builds and tag breakdowns. Comments and activity at the bottom.
- **dashboard** Issue list shows labels, assignee and Linear ID; Linear connection card under Games & keys > Integrations.
- **dashboard** Placeholder pages for Events, Retention, Funnels, Players, Issues, Player reports, AI proxy, Config & flags and OTA updates.
- **worker** pg-boss worker with a heartbeat job.
- **dashboard** React + Vite + Tailwind v4 app with TanStack Router and Query, and a typed client for `/admin`.
- **db** First schema: orgs, games, environments, API keys (stored hashed), users, org memberships with roles, sign-in codes, sessions.
- **db** `labels`, `issue_labels`, `issue_activity`, `attachments`, `integrations`; issues gain assignee and Linear link; ClickHouse `crash_events` gains level, tags, contexts, extra and attachment count.
- **db** `issues` (Postgres) and `crash_events` (ClickHouse).
- **db** AI tables: `ai_templates` and `ai_settings` (Postgres), `ai_calls` (ClickHouse).
- **db** ClickHouse `events` table (monthly partitions, retries deduplicated by event id) and `pnpm db:migrate` for both databases.
- **infra** Docker Compose for local dev (Postgres, ClickHouse, RustFS for S3-compatible storage, Mailpit for email) and production (plus api, worker, Caddy on one domain).
- **docs** Product spec (`SPEC.md`): modules, project structure, code rules, changelog rules.

### Security
- **api** Sign-in codes expire after 10 minutes, work once, die after 5 wrong tries, and only the newest code works. They are stored as an HMAC, never in plain text, and never logged.
- **api** Code requests are limited to 3 per email and 10 per IP per 15 minutes; checks to 20 per IP. `SIGNUP_ALLOWLIST` controls who may create an account, and the form answers the same for every email.
- **api** Keys are shown once and stored only as SHA-256 hashes, prefixed `rk_client_` / `rk_server_` so leaks are easy to spot. Only owners can create server keys; viewers can't create or revoke anything; non-members get 404 for another studio's IDs.
- **api** The OpenRouter key never leaves the server. Per-player calls per minute, per-player daily tokens and a per-game monthly spend cap are enforced before every call; a hit limit returns `429 rate_limited`. Only owners can change limits.
- **api** Linear API keys are encrypted at rest (AES-256-GCM, key derived from `AUTH_SECRET`) and never returned by the API. Only owners can connect or disconnect integrations. Assignees must be studio members; comments can only be deleted by their author.
- **api** Session cookies are httpOnly, SameSite=Lax and Secure in production, stored hashed, and expire after 30 days (7 idle). `/admin` rejects cross-site form posts.
