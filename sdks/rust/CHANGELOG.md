# Changelog — roost-sdk (Rust)

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **sdk-rust** `Roost::report(PlayerReport)` sends a player's bug report with a screenshot, the scope and `Config::attachments` files, and returns its id. Blocks until sent; call it off the render thread.
- **sdk-rust** `Roost::start(Config)` client: events are queued and sent from a background thread, kept on disk between launches with `Config::data_dir`.
- **sdk-rust** Panics are reported automatically with parsed frames, the thread name, the scope and attachments (2 MB budget); `Config::in_app` marks the game's own crates for grouping.
- **sdk-rust** `capture_error` (with the `source()` chain and stack) and `capture_message`, with per-report `Capture` options: level, tags, contexts, extra, fingerprint, attachments.
- **sdk-rust** Scope that goes on every later report: `set_tag`, `set_context`, `set_extra`, `add_breadcrumb`, `set_attachment`.
- **sdk-rust** `Config::attachments` gathers files (e.g. the save) at capture time; `Config::before_send` edits or drops reports.
- **sdk-rust** `Roost::ai(template, vars)` runs AI proxy templates.
- **sdk-rust** `Transport` trait to send through the engine's own HTTP stack; `examples/quickstart.rs`.
