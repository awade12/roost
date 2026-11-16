//! Sends a few events, a caught error with a save file, and a panic to a Roost server.
//!
//! ROOST_ENDPOINT=http://localhost:8787 ROOST_KEY=rk_client_… cargo run --example quickstart

use roost_sdk::{Attachment, Breadcrumb, BreadcrumbLevel, Capture, Config, Roost, TrackEvent};
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
    let endpoint =
        std::env::var("ROOST_ENDPOINT").unwrap_or_else(|_| "http://localhost:8787".into());
    let key = std::env::var("ROOST_KEY").unwrap_or_default();
    let data_dir = std::env::temp_dir().join("roost-quickstart");

    let roost = Roost::start(
        Config::new(endpoint, key, "player-rust-1", "0.9.0+rust")
            .data_dir(&data_dir)
            .in_app("quickstart::")
            .os_version("Steam Deck 3.7")
            .attachments(|| {
                vec![Attachment::new(
                    "save.json",
                    r#"{"slot":2,"gold":340,"level":"forest-3"}"#,
                )]
            }),
    )?;

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
