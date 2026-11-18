# Changelog — @roost/sdk

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-11-17

### Fixed
- **sdk-js** Works on Hermes (React Native) without a polyfill. The client used `crypto.randomUUID()`, which Hermes doesn't have, so `new Roost()` threw at start-up and no events were sent. It now falls back to `crypto.getRandomValues`, then `Math.random`.

### Added
- **sdk-js** `roost.decide(decision, state)` runs a decision template (yes/no, choice and score questions kept on the server) on free text or named fields, e.g. to classify what a player wrote. Resolves with `{ answers, model, usage }`; throws `RoostAiError` on failure like `ai`.
- **sdk-js** `uuid()`: a v4 UUID that works on every engine, for things like a per-install player id.
- **sdk-js** Ships as a standalone package with no dependencies (own wire types, checked against the API's contracts at compile time). Install from your Roost server: `npm install <roost>/sdk/js/latest.tgz`.
- **sdk-js** `roost.ai(template, vars, { messages, model, maxTokens, temperature })` for conversation history and per-call options, and `roost.aiStream(template, vars, { onDelta })` to show text as it's written.
- **sdk-js** Flags: `roost.flags.getBoolean / getString / getNumber / getObject(key, default)`, refreshed at start and every 5 minutes (`configRefreshMs`), kept in storage for offline launches, with `onChange`. `roost.openFeatureProvider()` plugs Roost into OpenFeature.
- **sdk-js** `roost.report({ message, category, email, attachments })` sends a player's bug report with the current tags, contexts, breadcrumbs and `getAttachments` files (e.g. the save). Returns `{ ok, id }` or `{ ok: false, error }` instead of throwing.
- **sdk-js** Full control over crash reports: `setTag` / `removeTag`, `setContext`, `setExtra`, `addBreadcrumb` (category, level, message), per-report `tags` / `contexts` / `extra` / `level` / `fingerprint`, `captureMessage`, and `beforeSend` to edit or drop any report.
- **sdk-js** Attachments: pass `attachments` per report or `getAttachments` (e.g. the save file) for every report. Up to 5 files, 10 MB each; fatal crashes keep up to 2 MB so they can be saved before the app exits. Files upload after the report, and retry on the next launch if offline.
- **sdk-js** `maxBreadcrumbs` option (default 50, max 100).
- **sdk-js** Crash reporting: `captureError(error, { fatal })`, automatic handlers for React Native (`ErrorUtils`) and browsers (`error`, `unhandledrejection`), the last 50 tracked events as breadcrumbs, and reports saved to storage so a fatal crash is sent on the next launch. Turn off with `captureCrashes: false`.
- **sdk-js** `roost.ai(template, vars)` runs a prompt template on the Roost AI proxy and throws `RoostAiError` (with the API's `code`, e.g. `rate_limited`) on failure.
- **sdk-js** `Roost` client: `track()`, batched `flush()`, offline queue with pluggable storage (AsyncStorage / localStorage), `session_start` / `session_end` events.

### Changed
- **sdk-js** Licensed under MIT, so it can ship in closed-source games. The package now includes `LICENSE` and a `README.md` covering install, events, crashes, reports, flags and AI.
