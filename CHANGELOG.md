# Changelog

All notable changes to the Roost server (api, worker, dashboard) are recorded here.
SDKs keep their own changelogs in `packages/sdk-js/` and `sdks/rust/`.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Rules: see "Changelog" in `SPEC.md`.

## [Unreleased]

### Added
- **api** AI decisions: `POST /v1/ai/decide {decision, state, playerId}` runs a decision template (OpenRouter's Decisions API, e.g. `liquid/d1.2`) by name and returns typed answers: `noul` (yes probability), `choice` (pick, confidence, probabilities) and `score` (score, confidence, probabilities, legend). Client keys allowed; the same per-player and per-game AI limits apply, and every call is logged under the decision's name so spend caps and usage count it. Decision models don't work through `/v1/ai/run`. Additive.
- **api** Config as code: `decisions` in `roost.config.json` (model plus up to 20 questions), pushed and pruned like templates (`kind: "decision"` in the changes, `dry_run` honoured, versions bump only on a real change) and returned by `GET /v1/manage/config`, so `roost pull` writes them back.
- **repo** The setup guide (`ROOST.md`) for Expo and web explains decisions and `roost.decide`.
- **dashboard** The AI page lists decision templates (read-only) with their version, model, questions and 30-day usage.
- **api** AI speech: `POST /v1/ai/speak {template, text, voice, instructions?, playerId}` says a line with a speech template (OpenRouter's text-to-speech, e.g. `openai/gpt-4o-mini-tts`) and answers with the audio bytes (`content-type` `audio/mpeg` for mp3, OpenRouter's type for pcm) plus `x-roost-model` and `x-roost-chars` headers (now exposed to browsers). The voice must be one the template lists and the text must fit its `maxChars`; instructions (up to 300 characters) replace the template's default. Client keys allowed; the same per-player and per-game AI limits apply, with the text's length counted as tokens, so a player's daily budget covers speech. Errors use the usual JSON shape. OpenRouter reports no cost for speech, so speech calls are logged with a cost of 0 and don't count toward the monthly spend cap. Additive.
- **api** Config as code: `speech` in `roost.config.json` (`model`, `voices` (1–200), `format` `mp3`|`pcm` (default `mp3`), `maxChars` (default 500, at most 3,000), optional `instructions`), pushed, pruned and pulled like decisions (`kind: "speech"` in the changes).
- **repo** The setup guide (`ROOST.md`) for Expo and web explains speech templates and `roost.speak`.
- **dashboard** The AI page lists speech templates (read-only) with their version, model, voices, format, max length and 30-day requests, characters and errors.
- **infra** `infra/deploy.sh` upgrades a server in one step: builds while the old containers serve, backs up, swaps, waits for health, and rolls back to the previous commit if anything fails. `.github/workflows/deploy.yml` runs it over SSH when CI passes on `main` (setup in DEPLOY.md, "Automatic deploys").
- **infra** `infra/docker-compose.behind-proxy.yml` runs Roost on a server that already has a reverse proxy on 80/443: Roost's Caddy serves HTTP on `127.0.0.1:8790` and keeps the player's IP from `X-Forwarded-For` (`ROOST_TRUSTED_PROXIES`). See DEPLOY.md.
- **infra** The API can run as several replicas (`roost up -d --scale api=2`): Caddy now finds every `api` container and round-robins between them.
- **api** The API applies pending Postgres and ClickHouse migrations on start, before it accepts requests, so upgrading is `git pull` and `docker compose up -d --build`. A Postgres advisory lock keeps two replicas from migrating at once. Turn it off with `MIGRATE_ON_START=false`; `pnpm db:migrate` still works.
- **infra** Daily backups: a new `backup` service dumps Postgres (`pg_dump`, gzip) and backs up ClickHouse (`BACKUP DATABASE … TO S3`) into `s3://$S3_BUCKET/$BACKUP_PREFIX/` at `BACKUP_HOUR` UTC. `roost-backup list` and `restore postgres|clickhouse <stamp>` bring them back. Old backups are kept until an S3 lifecycle rule expires them.
- **docs** `DEPLOY.md`: run Roost on one VPS (configuration, HTTPS, first sign-in, SDKs, upgrades, backups and restore, scaling, troubleshooting). `.env.example` now lists and explains every setting the server reads.
- **api** Studio invites: owners invite people by email with a role (`/admin/orgs/:orgId/invites`); the link works for 7 days, only for that address, and lets them sign up even if the sign-up allowlist wouldn't. Re-inviting replaces the old link; owners can revoke pending invites.
- **dashboard** Members page: invite form and pending invites with revoke. Invite links open a "Join <studio>" page that works before the person has any studio.
- **docs** Roost is open source: the server is under FSL-1.1-ALv2 (each version becomes Apache-2.0 two years after release) and the SDKs under MIT. New `CONTRIBUTING.md`, `SECURITY.md` (report vulnerabilities privately through GitHub), issue forms and a pull request template.
- **api** SDKs are hosted by Roost itself under `/sdk`: `npm install <roost>/sdk/js/latest.tgz` for Expo and web, and a Cargo sparse registry (`sparse+<roost>/sdk/cargo/`) for `roost-sdk`. `GET /sdk` lists versions and install lines. The setup guide (`ROOST.md`) now uses these.
- **repo** `pnpm build:sdks` packages both SDKs into `dist/sdk`; the API image builds them at build time.
- **dashboard** "Set up in your game": each game gets a setup dialog (game settings, game cards, and the Overview's first-run guide) that builds `ROOST.md` (step-by-step instructions written for a coding agent: endpoint, key, install, start-up code, events, crashes, reports, flags, AI, CI debug files, checks) and a starter `roost.config.json` for Expo, web or Rust, with only the features you pick. Copy, download, or "Copy for an agent" as one message; optionally create a client key and write it in.
- **repo** `roost init --platform expo|web|rust [--features …]` writes the same files from the terminal, named after the server key's game and listing its real templates and flags. `GET /v1/manage/info` returns the key's game and environment.
- **api** Management API for server keys: `GET`/`PUT /v1/manage/config` (whole config, with `prune` and `dry_run`), and per item `/v1/manage/templates/:name`, `/v1/manage/flags/:key`, `/v1/manage/ai-limits`, `/v1/manage/settings`. Pushing an unchanged config changes nothing (no version bumps).
- **api** Query API for server keys: `/v1/query/events`, `/events/series`, `/overview`, `/retention`, `/players/:playerId` and `/issues`, scoped to the key's environment.
- **api** AI proxy: `/v1/ai/run` takes conversation history (`messages`), per-call `options` (a model the template lists, fewer max tokens, temperature) and `stream: true` (Server-Sent Events: `delta`, then `done` or `error`). New `POST /v1/ai/complete` for any prompt and model with a server key, logged as `_direct` and counted against the game's limits. All additive.
- **repo** `roost` CLI (`pnpm roost push|pull`): keep templates, flags and AI limits in `roost.config.json` or `.ts` in the game repo. `--dry-run` shows changes, `--prune` removes what's not in the file.
- **api** Retention: `GET /admin/environments/:environmentId/retention?days=30|60|90&build=&platform=` returns install-day cohorts with players back on D1, D2, D3, D7, D14 and D30, and size-weighted averages over cohorts old enough to count. Unfinished days are left out instead of showing low.
- **dashboard** Retention page: new players, D1/D7/D30 cards, and a cohort grid shaded by share retained, with build and platform filters.
- **api** Players: search players seen in the last 30 days, and one player's profile (first and last seen, events, sessions, days played, builds, daily activity, top events, crashes with their issues, and their reports).
- **dashboard** Players page and player profile, with "Open in Events" pre-filtered to that player (Events accepts `?player=`).
- **api** Config & flags: per-environment flags (on/off, text, number, JSON) with a value for everyone, a gradual rollout (stable per-player bucketing, so raising the percent only adds players) and per-player overrides. `GET /v1/config?playerId=` returns every flag resolved for that player with OpenFeature reasons and variants, and answers 304 to `If-None-Match` until something changes. Admin create, edit and delete.
- **dashboard** Config & flags page: flag list with rollout share and override counts, and an editor that checks every value against the flag's type.
- **api** Native crashes: `POST /v1/minidumps` and `PUT /v1/minidumps/:id/dump` (up to 20 MB, must be a minidump). The worker stackwalks each dump with Mozilla's `minidump-stackwalk`, using any matching uploaded symbols, then groups it into an issue with the OS exception as the type and the crashing thread as the stack. The dump is attached to the event. Unmatched frames show as `module+0xoffset`.
- **api** Debug file uploads with a server key: `PUT /v1/debug-files/breakpad` (`.sym` from `dump_syms`; module and debug id read from the file) and `PUT /v1/debug-files/sourcemaps?build=&name=`. Admin list and delete per game.
- **api** JS source maps: crashes from a build with uploaded source maps wait for the worker, which maps V8, Hermes and Safari stacks back to original files and lines before grouping, so issues group on your real code. Library frames (`node_modules`) aren't in-app.
- **worker** Symbolication queue, drained every 5 seconds; safe with several workers. A crash that can't be processed after 3 tries, or whose dump never arrives within an hour, is still recorded, unsymbolicated.
- **dashboard** Debug files section in game settings: uploaded symbols and source maps, with delete and upload instructions.
- **repo** `pnpm upload:debug-files --endpoint --key [--build] <files>` uploads `.sym` and `.map` files from CI.
- **infra** The worker image includes `minidump-stackwalk`.
- **api** Event explorer: `GET /admin/environments/:environmentId/events` (newest first, 100 per page with a cursor), `/events/series` (hourly or daily counts) and `/events/facets` (names, builds, platforms). Filter by time range, event name, player, build, platform, or any prop `key = value` (strings, numbers, booleans).
- **dashboard** Events page: filters, a chart of the filtered events, and the stream. Click a row for its props JSON (with copy), or a name or player to filter by it. The chart supports hourly buckets.
- **dashboard** Redesigned sidebar (option C in Paper): the game switcher and environment tabs sit at the top under the wordmark, unbuilt sections are dimmed with a "soon" tag, Issues shows new and regressed counts and Player reports shows open ones, and the footer has your account, Settings and sign out. The active page is a quiet fill, not an accent bar.
- **api** `GET /admin/environments/:environmentId/nav-counts` for the sidebar badges.
- **api** Player reports: `POST /v1/reports` (a player's message, category, optional email, tags, contexts, extra, breadcrumbs) and `PUT /v1/reports/:reportId/attachments/:attachmentId` for screenshots and saves. Additive to `/v1`; retries are stored once.
- **api** Admin: list reports per environment (open/closed), report detail with files, close/reopen, and link a report to an issue in the same environment.
- **dashboard** Player reports page: open/closed list, and a report page with the player's message, screenshots shown inline, file downloads, device, tags, contexts and what the player did before reporting. Copy the player's email when they shared one.
- **api** Game settings (`GET`/`PUT /admin/games/:gameId/settings`): pause a game's whole `/v1` API, set the per-key rate limit, choose how many stack frames group issues, and auto-resolve quiet issues. Saved per game with defaults in code; owners only.
- **api** Rename games and studios, add environments (e.g. `staging`), change member roles and remove members. A studio always keeps at least one owner.
- **api** Alerts: Discord, Slack, webhook and email channels per studio (with a test send), and rules per game for new issues, regressions and spikes (N reports in M minutes, then quiet for a cooldown). The worker checks rules every minute; each alert is sent once and listed in the alert history, with delivery errors.
- **dashboard** Settings with tabs (Studio, Members, Games & keys, Integrations) and a settings page per game: name, environments, game API switches, issue grouping and auto-resolve, and AI limits. Changed values show their default and a reset.
- **dashboard** Alerts page: rules with on/off switches, a rule editor, and recently sent alerts. Alert channels live under Settings → Integrations.
- **dashboard** New text-only Roost wordmark in the sidebar and sign-in screens.
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

### Changed
- **api** Rate limits (sign-in codes, invites, per-key requests per minute) are counted in Postgres instead of each API process's memory, so every replica shares the same limits. Counters live in a small unlogged table that the worker prunes hourly; only hashes of the keys are stored.
- **infra** Production compose points the API and worker at the bundled Postgres and ClickHouse itself and sets `NODE_ENV=production` and port 8787, so `.env` only needs the passwords. Run it as `docker compose --env-file .env -f infra/docker-compose.yml …` from the repo root. The worker now waits until the API is healthy (migrations done).
- **api** Debug-file uploads use the same server-key check as the management API (same error).
- **dashboard** The game and environment picker moved from the header into the sidebar; the header shows game / page.
- **api** The `/v1` rate limit is now per key and set per game (default 120 a minute, as before) instead of fixed. Key lookups are cached for 30 seconds; revoking a key still takes effect at once on the same server.

### Fixed
- **dashboard** The Expo setup guide (`ROOST.md`) made the player id with `crypto.randomUUID()`, which Hermes doesn't have; it now uses the SDK's `uuid()`. Guides also say to log Roost start-up errors in dev rather than swallow them, and give a `curl` check that tells a bad key or server apart from an app problem.
- **dashboard** Segmented controls inside forms no longer submit the form when clicked.

### Security
- **api** SDK downloads under `/sdk` need a valid Roost key (any unrevoked client or server key): `?key=` on the npm URL, or Cargo's registry login (`auth-required`, `credential-provider = ["cargo:token"]`). Only the version info page and Cargo's `config.json` are open; they hold no code. Revoking a key stops its downloads.
- **api** Alert webhook URLs are encrypted at rest like integration keys and never returned; the dashboard shows only the host and last 4 characters. Discord and Slack URLs must be the provider's webhook endpoint, and others must be https. Test sends go only to the person testing.
- **api** Sign-in codes expire after 10 minutes, work once, die after 5 wrong tries, and only the newest code works. They are stored as an HMAC, never in plain text, and never logged.
- **api** Code requests are limited to 3 per email and 10 per IP per 15 minutes; checks to 20 per IP. `SIGNUP_ALLOWLIST` controls who may create an account, and the form answers the same for every email.
- **api** Keys are shown once and stored only as SHA-256 hashes, prefixed `rk_client_` / `rk_server_` so leaks are easy to spot. Only owners can create server keys; viewers can't create or revoke anything; non-members get 404 for another studio's IDs.
- **api** The OpenRouter key never leaves the server. Per-player calls per minute, per-player daily tokens and a per-game monthly spend cap are enforced before every call; a hit limit returns `429 rate_limited`. Only owners can change limits.
- **api** Linear API keys are encrypted at rest (AES-256-GCM, key derived from `AUTH_SECRET`) and never returned by the API. Only owners can connect or disconnect integrations. Assignees must be studio members; comments can only be deleted by their author.
- **api** Session cookies are httpOnly, SameSite=Lax and Secure in production, stored hashed, and expire after 30 days (7 idle). `/admin` rejects cross-site form posts.
