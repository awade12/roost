//! Roost SDK for the custom Rust engine: analytics, crash and error reports, and the AI proxy.
//!
//! ```no_run
//! use roost_sdk::{Attachment, Breadcrumb, Capture, Config, Roost, TrackEvent};
//!
//! let roost = Roost::start(
//!     Config::new("https://roost.example.com", "rk_client_…", "player-123", "1.4.2")
//!         .data_dir("saves/")              // keeps unsent data (and panics) between launches
//!         .in_app("my_game::")             // groups issues on the game's own frames
//!         .attachments(|| vec![Attachment::new("save.json", std::fs::read("saves/slot1.json").unwrap_or_default())]),
//! )?;
//!
//! roost.track_event(TrackEvent::new("level_complete").prop("level", 3).value(42.0));
//! roost.set_tag("level", "forest-3");
//! roost.set_context("match", serde_json::json!({ "round": 3, "opponent": "bot-hard" }));
//! roost.add_breadcrumb(Breadcrumb::new("save_loaded").category("save").message("slot 1"));
//!
//! # let err = std::io::Error::other("bad save");
//! roost.capture_error(&err, Capture::new().tag("slot", 1).fingerprint(["save-corrupt"]));
//! // Panics are reported automatically.
//! # Ok::<(), roost_sdk::RoostError>(())
//! ```
//!
//! Rule: this crate must never crash the game. No `unwrap`, `expect` or `panic!`
//! (enforced by clippy lints in Cargo.toml). Every failure is swallowed or returned.

mod client;
mod crash;
mod error;
mod model;
mod transport;

pub use client::{AiResponse, AiUsage, AttachmentsFn, BeforeSend, Config, Roost};
pub use crash::{
    Attachment, Capture, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, PANIC_ATTACHMENT_BUDGET,
};
pub use error::RoostError;
pub use model::{
    AttachmentRef, Breadcrumb, BreadcrumbLevel, Crash, DeviceContext, Event, Frame, JsonMap, Kind,
    Level, Platform, Props, TrackEvent,
};
pub use transport::{MAX_QUEUED, Reply, Transport};
