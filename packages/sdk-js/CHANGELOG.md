# Changelog — @roost/sdk

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **sdk-js** Full control over crash reports: `setTag` / `removeTag`, `setContext`, `setExtra`, `addBreadcrumb` (category, level, message), per-report `tags` / `contexts` / `extra` / `level` / `fingerprint`, `captureMessage`, and `beforeSend` to edit or drop any report.
- **sdk-js** Attachments: pass `attachments` per report or `getAttachments` (e.g. the save file) for every report. Up to 5 files, 10 MB each; fatal crashes keep up to 2 MB so they can be saved before the app exits. Files upload after the report, and retry on the next launch if offline.
- **sdk-js** `maxBreadcrumbs` option (default 50, max 100).
- **sdk-js** Crash reporting: `captureError(error, { fatal })`, automatic handlers for React Native (`ErrorUtils`) and browsers (`error`, `unhandledrejection`), the last 50 tracked events as breadcrumbs, and reports saved to storage so a fatal crash is sent on the next launch. Turn off with `captureCrashes: false`.
- **sdk-js** `roost.ai(template, vars)` runs a prompt template on the Roost AI proxy and throws `RoostAiError` (with the API's `code`, e.g. `rate_limited`) on failure.
- **sdk-js** `Roost` client: `track()`, batched `flush()`, offline queue with pluggable storage (AsyncStorage / localStorage), `session_start` / `session_end` events.
