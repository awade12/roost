# Changelog — roost-sdk (Rust)

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **sdk-rust** Installable from your Roost server's Cargo registry: `roost-sdk = { version = "0.2", registry = "roost" }` with `[registries.roost] index = "sparse+<roost>/sdk/cargo/"`.
- **sdk-rust** `ai_with(template, vars, &AiOptions)` (history via `AiTurn`, model, max tokens, temperature) and `ai_stream(…, on_delta)` for streamed answers. `Transport` gained `post_stream` with a default.
- **sdk-rust** Flags: `flag_bool`, `flag_str`, `flag_f64`, `flag_json::<T>` and `flag_details`, fetched on the background thread at start and every 5 minutes (`Config::config_refresh`), kept in `data_dir` between launches. `refresh_flags()` fetches now. `Transport` gained a `get` method with a default, so custom transports keep compiling.
- **sdk-rust** Native crash capture behind the `native-crashes` feature: segfaults, aborts and stack overflows are written as minidumps by a monitor process and sent on the next launch with the scope at crash time and `Config::attachments` files. Call `roost_sdk::native::run_monitor_if_requested()` first in `main` and set `Config::native_crashes(true)` with a `data_dir`.
- **sdk-rust** `Roost::report(PlayerReport)` sends a player's bug report with a screenshot, the scope and `Config::attachments` files, and returns its id. Blocks until sent; call it off the render thread.
- **sdk-rust** `Roost::start(Config)` client: events are queued and sent from a background thread, kept on disk between launches with `Config::data_dir`.
- **sdk-rust** Panics are reported automatically with parsed frames, the thread name, the scope and attachments (2 MB budget); `Config::in_app` marks the game's own crates for grouping.
- **sdk-rust** `capture_error` (with the `source()` chain and stack) and `capture_message`, with per-report `Capture` options: level, tags, contexts, extra, fingerprint, attachments.
- **sdk-rust** Scope that goes on every later report: `set_tag`, `set_context`, `set_extra`, `add_breadcrumb`, `set_attachment`.
- **sdk-rust** `Config::attachments` gathers files (e.g. the save) at capture time; `Config::before_send` edits or drops reports.
- **sdk-rust** `Roost::ai(template, vars)` runs AI proxy templates.
- **sdk-rust** `Transport` trait to send through the engine's own HTTP stack; `examples/quickstart.rs`.

### Changed
- **sdk-rust** Licensed under MIT (was unlicensed), so it can ship in closed-source games. The crate now includes `LICENSE` and a `README.md` covering the registry setup, events, panics, native crashes, reports, flags and AI.
