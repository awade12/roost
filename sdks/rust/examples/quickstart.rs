//! Sends a few events, a caught error with a save file, and a panic to a Roost server.
//!
//! ROOST_ENDPOINT=http://localhost:8787 ROOST_KEY=rk_client_… cargo run --example quickstart
//! Add `--features native-crashes` to also capture hard crashes (segfaults) as minidumps.

use roost_sdk::{
    Attachment, Breadcrumb, BreadcrumbLevel, Capture, Config, PlayerReport, Roost, TrackEvent,
};
use std::fmt;

#[derive(Debug)]
struct SaveCorrupt(std::io::Error);

impl fmt::Display for SaveCorrupt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "save slot 2 failed to load")
    }
}

impl std::error::Error for SaveCorrupt {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.0)
    }
}

/// Smallest valid PNG (1×1, dark gray), standing in for a real screenshot.
const PNG_1X1: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3A, 0x7E, 0x9B,
    0x55, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

fn load_level(n: usize) -> u32 {
    let spawns: Vec<u32> = vec![1, 2];
    spawns.get(n).copied().unwrap_or_else(|| {
        #[allow(clippy::panic)] // The example's point is to panic.
        {
            panic!("no spawn point {n} in forest-3")
        }
    })
}

fn main() -> Result<(), roost_sdk::RoostError> {
    // With native crashes on, the game re-launches itself as the crash monitor: let it run.
    #[cfg(feature = "native-crashes")]
    if roost_sdk::native::run_monitor_if_requested() {
        return Ok(());
    }
    let endpoint =
        std::env::var("ROOST_ENDPOINT").unwrap_or_else(|_| "http://localhost:8787".into());
    let key = std::env::var("ROOST_KEY").unwrap_or_default();
    let data_dir = std::env::temp_dir().join("roost-quickstart");

    let config = Config::new(endpoint, key, "player-rust-1", "0.9.0+rust")
        .data_dir(&data_dir)
        .in_app("quickstart::")
        .os_version("Steam Deck 3.7")
        .attachments(|| {
            vec![Attachment::new(
                "save.json",
                r#"{"slot":2,"gold":340,"level":"forest-3"}"#,
            )]
        });
    #[cfg(feature = "native-crashes")]
    let config = config.native_crashes(true);
    let roost = Roost::start(config)?;

    roost.set_tag("level", "forest-3");
    roost.set_context(
        "match",
        serde_json::json!({ "round": 3, "opponent": "bot-hard" }),
    );
    roost.track_event(TrackEvent::new("level_start").prop("level", "forest-3"));
    roost.add_breadcrumb(
        Breadcrumb::new("save_migration")
            .category("save")
            .level(BreadcrumbLevel::Warning)
            .message("inventory missing"),
    );

    let err = SaveCorrupt(std::io::Error::other("unexpected end of file"));
    roost.capture_error(&err, Capture::new().tag("slot", 2).extra("saveVersion", 7));

    // What "Report a bug" in the pause menu would send (blocking: call off the render thread).
    let screenshot = Attachment::new("screenshot.png", PNG_1X1.to_vec());
    match roost.report(
        PlayerReport::new("The door after the forest-3 boss never opens")
            .attachment(screenshot)
            .tag("area", "boss-door"),
    ) {
        Ok(id) => println!("report sent: {id}"),
        Err(e) => println!("report failed: {e}"),
    }

    // A panic on a loader thread: reported by the hook, game keeps running.
    let _ = std::thread::Builder::new()
        .name("level-loader".into())
        .spawn(|| load_level(5))
        .map(|h| h.join());

    roost.track_event(
        TrackEvent::new("level_complete")
            .prop("level", "forest-3")
            .value(42.0),
    );
    let sent = roost.flush();
    roost.shutdown();
    println!("flushed: {sent}");
    Ok(())
}
