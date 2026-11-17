# roost-sdk

The Roost SDK for games with their own Rust engine (Steam desktop: Windows, macOS, Linux and
Steam Deck): analytics events, panic and error reports, native crash capture (minidumps),
player bug reports, remote config and feature flags, and the Roost AI proxy.

**It never crashes the game.** The crate has no `unwrap`, `expect` or `panic!` (clippy denies
them), every failure is swallowed or returned as a `RoostError`, and tracking, scope and flag
calls never block on the network.

## Install

Roost serves the crate itself from a Cargo sparse registry, so there's nothing to set up on
crates.io. In the game repo:

```toml
# .cargo/config.toml
[registries.roost]
index = "sparse+https://<roost>/sdk/cargo/"
credential-provider = ["cargo:token"]
```

```toml
# Cargo.toml
[dependencies]
roost-sdk = { version = "0.2", registry = "roost" }
# or, with hard-crash capture:
# roost-sdk = { version = "0.2", registry = "roost", features = ["native-crashes"] }
```

Log in once per machine with a **client key** (`rk_client_…`, it ships in the game anyway;
never use a server key here). CI sets `CARGO_REGISTRIES_ROOST_TOKEN` instead.

```bash
cargo login --registry roost rk_client_…
```

## Quick start

```rust
use roost_sdk::{Config, Roost, TrackEvent};

fn main() -> Result<(), roost_sdk::RoostError> {
    let roost = Roost::start(
        Config::new("https://roost.example.com", "rk_client_…", "player-123", "1.4.2+881")
            .data_dir("saves/")     // keeps unsent events and panics between launches
            .in_app("my_game::"),   // groups issues on the game's own frames
    )?;

    roost.track("level_start");
    roost.track_event(TrackEvent::new("level_complete").prop("level", 3).value(42.0));

    // … run the game …
    roost.shutdown(); // also runs on drop
    Ok(())
}
```

`Roost::start` returns an error only for bad config (endpoint not `http(s)://`, empty client
key, player id or build not 1–64 characters). It loads anything left from the last run,
starts a background sender thread, installs the panic hook and tracks `session_start`.
Share the client with `Arc<Roost>` or a `static OnceLock<Roost>`. `shutdown()` tracks
`session_end`, sends what it can and saves the rest.

See [`examples/quickstart.rs`](examples/quickstart.rs) for a runnable tour:

```bash
ROOST_ENDPOINT=http://localhost:8787 ROOST_KEY=rk_client_… cargo run --example quickstart
```

### Config

`Config::new(endpoint, client_key, player_id, build)` plus builder calls:

| Method | Default | What it does |
|---|---|---|
| `data_dir(path)` | none | Where unsent events, crash reports and flags are kept. Strongly recommended: without it a panic that kills the game is lost |
| `platform(Platform)` | compile target | `Windows`, `Macos`, `Linux`, `Ios`, `Android`, `Web` |
| `os_version`, `device_model`, `locale` | none | Extra device context |
| `flush_interval(Duration)` | 10 s | How often queued events are sent |
| `timeout(Duration)` | 10 s | Per-request timeout |
| `config_refresh(Duration)` | 5 min | How often flags are re-fetched |
| `capture_panics(bool)` | `true` | Install the panic hook |
| `max_breadcrumbs(n)` | 50 | Recent events and breadcrumbs kept for reports (max 100) |
| `in_app(prefix)` | none | A crate path prefix that is the game's own code; call once per crate |
| `before_send(f)` | none | Edit a report, or return `None` to drop it |
| `attachments(f)` | none | Files gathered for every report at capture time, e.g. the save |
| `native_crashes(bool)` | `false` | Hard-crash capture (feature `native-crashes`) |
| `transport(Arc<dyn Transport>)` | `ureq` | Send through the engine's own HTTP stack |

## Events

```rust
roost.track("session_menu_open");
roost.track_event(TrackEvent::new("purchase").prop("item", "sword").value(4.99));
let sent = roost.flush(); // send now and wait (up to the timeout)
```

Event names must be snake_case, up to 64 characters; invalid ones are dropped. Events are
queued (up to `MAX_QUEUED`, 5000), sent from the background thread, and kept on disk in
`data_dir` while offline. Every event also becomes a breadcrumb on later reports.

## Panics and errors

Panics are reported automatically (unless `capture_panics(false)`), with parsed frames, the
thread name as a tag, the scope and attachments (2 MB budget for panics). The report is saved
first, so it's sent on the next launch if the panic kills the game.

Caught errors and messages:

```rust
use roost_sdk::{Capture, Level};

if let Err(err) = load_save(slot) {
    roost.capture_error(&err, Capture::new().tag("slot", slot).extra("saveVersion", 7).fingerprint(["save-corrupt"]));
}
roost.capture_message("Save migration fell back to defaults", Capture::new().level(Level::Warning));
```

`capture_error` sends the error's `source()` chain and the current stack. `Capture` options:
`level`, `error_type`, `tag`, `context`, `extra`, `fingerprint` (group by this instead of the
stack) and `attachment` (this report only).

Scope that goes on every later report:

```rust
use roost_sdk::{Attachment, Breadcrumb, BreadcrumbLevel};

roost.set_tag("level", "forest-3");
roost.set_context("match", serde_json::json!({ "round": 3, "opponent": "bot-hard" }));
roost.set_extra("difficulty", "hard");
roost.add_breadcrumb(Breadcrumb::new("save_loaded").category("save").level(BreadcrumbLevel::Info).message("slot 2"));
roost.set_attachment(Attachment::new("settings.ini", settings_bytes));
// remove_tag, remove_context, remove_attachment undo these.
```

Attach the current save to every report, and scrub reports before they're sent:

```rust
let config = config
    .attachments(|| vec![Attachment::new("save.json", std::fs::read("saves/slot1.json").unwrap_or_default())])
    .before_send(|mut report| {
        report.message = report.message.replace(&player_name(), "<player>");
        Some(report)
    });
```

Up to 5 files (`MAX_ATTACHMENTS`), 10 MB each (`MAX_ATTACHMENT_BYTES`). Both callbacks run
inside the panic hook for panics, so they must not panic themselves.

## Hard crashes (feature `native-crashes`)

Segfaults, aborts and stack overflows kill the game before any Rust code can report them.
With the `native-crashes` feature the game re-launches itself as a small monitor process that
writes a minidump when the game dies. It's sent on the next launch with the scope at crash
time and the `Config::attachments` files, and the server symbolicates it with your uploaded
symbols.

```rust
fn main() -> Result<(), roost_sdk::RoostError> {
    // First thing in main: in the monitor process this runs the monitor and returns true.
    if roost_sdk::native::run_monitor_if_requested() {
        return Ok(());
    }
    let roost = Roost::start(config.data_dir("saves/").native_crashes(true))?;
    // …
}
```

It needs `data_dir`. If the monitor can't start, the game runs without native capture.

## Player bug reports

For a "Report a bug" button. Sends the report with the current tags, contexts, breadcrumbs,
scope attachments and `Config::attachments` files, and returns its id. It **blocks** until
sent, so call it off the render thread.

```rust
use roost_sdk::{Attachment, PlayerReport, ReportCategory};

let result = roost.report(
    PlayerReport::new("The door after the boss never opens")
        .category(ReportCategory::Bug)          // Bug, Feedback, Crash, Other
        .attachment(Attachment::new("screenshot.png", png).content_type("image/png"))
        .tag("area", "boss-door"),
);
match result {
    Ok(id) => show_thanks(&id),
    Err(_) => show_retry(),
}
```

Also `email(…)` (only if the player chose to share it), `extra(…)`, and
`without_config_attachments()`.

## Remote config and flags

Flags are resolved for this player on the server and read from memory, so reads never touch
the network. They're fetched on the background thread at start and every `config_refresh`,
and kept in `data_dir` between launches. A missing flag, or one of the wrong type, returns
your default.

```rust
if roost.flag_bool("new_shop", false) { open_new_shop(); }
let greeting = roost.flag_str("greeting", "Hello");
let spawn_rate = roost.flag_f64("spawn_rate", 1.0);
let tuning: EnemyTuning = roost.flag_json("enemy.tuning", EnemyTuning::default());

let details = roost.flag_details("new_shop"); // Option<ResolvedFlag>: value, variant, reason
let changed = roost.refresh_flags();          // fetch now and wait (up to the timeout)
```

## AI

Runs a prompt template from the dashboard on the Roost AI proxy. AI calls **block** for the
whole model call, so make them off the render thread. They return
`RoostError::Api { code: "rate_limited", .. }` when the player's budget is used up, so the
game can show its own fallback line.

```rust
use roost_sdk::{AiOptions, AiTurn};

let reply = roost.ai("npc_greeting", serde_json::json!({ "name": "Ada" }))?;
println!("{} ({} tokens out)", reply.text, reply.usage.tokens_out);

let options = AiOptions {
    messages: vec![AiTurn::user("Who are you?"), AiTurn::assistant("A humble blacksmith.")],
    max_tokens: Some(200),
    ..AiOptions::default()
};
let reply = roost.ai_with("npc_chat", serde_json::json!({ "name": "Ada" }), &options)?;

// Typewriter dialogue: on_delta gets each piece as it's written.
let reply = roost.ai_stream("npc_chat", serde_json::json!({ "name": "Ada" }), &options, |piece| {
    bubble.push_str(piece);
})?;
```

`AiOptions` also takes `model` (one of the template's models) and `temperature`.

## Custom transport

Implement `Transport` (`post_json` and `put_bytes`; `get` and `post_stream` have defaults) to
send through the engine's own HTTP stack, a proxy, or a fake in tests, and pass it with
`Config::transport`. Without `get`, flags stay at their defaults; without `post_stream`,
`ai_stream` returns an error.

## License

MIT, see `LICENSE`. The Roost server itself is under a different license (FSL-1.1-ALv2);
see the [Roost repository](https://github.com/awade12/roost).
