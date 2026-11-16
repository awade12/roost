#![allow(clippy::unwrap_used)]
mod common;

use common::{Fake, config};
use roost_sdk::{Attachment, Breadcrumb, BreadcrumbLevel, Capture, Level, Roost};
use std::fmt;

#[derive(Debug)]
struct SaveCorrupt {
    source: std::io::Error,
}

impl fmt::Display for SaveCorrupt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "save slot 2 is corrupt")
    }
}

impl std::error::Error for SaveCorrupt {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

#[test]
fn error_report_carries_scope_options_and_files() {
    let fake = Fake::new();
    let cfg = config(&fake)
        .attachments(|| vec![Attachment::new("save.json", br#"{"gold":12}"#.to_vec())]);
    let roost = Roost::start(cfg).unwrap();
    roost.set_tag("level", "forest-3");
    roost.set_context("match", serde_json::json!({ "round": 3 }));
    roost.set_extra("saveVersion", 7);
    roost.add_breadcrumb(
        Breadcrumb::new("save_loaded")
            .category("save")
            .level(BreadcrumbLevel::Warning)
            .message("slot 2"),
    );
    roost.set_attachment(Attachment::new("game.log", "booted\n"));

    let err = SaveCorrupt {
        source: std::io::Error::other("unexpected EOF"),
    };
    roost.capture_error(
        &err,
        Capture::new()
            .tag("slot", 2)
            .fingerprint(["save-corrupt"])
            .level(Level::Warning),
    );
    assert!(roost.flush());

    let crash = &fake.crashes()[0];
    assert_eq!(crash["kind"], "error");
    assert_eq!(crash["level"], "warning");
    assert_eq!(crash["type"], "SaveCorrupt");
    assert_eq!(crash["message"], "save slot 2 is corrupt");
    assert!(
        crash["stack"]
            .as_str()
            .unwrap()
            .starts_with("Caused by: unexpected EOF")
    );
    assert_eq!(crash["tags"]["level"], "forest-3");
    assert_eq!(crash["tags"]["slot"], "2");
    assert_eq!(crash["contexts"]["match"]["round"], 3);
    assert_eq!(crash["extra"]["saveVersion"], 7);
    assert_eq!(crash["fingerprint"][0], "save-corrupt");
    let crumbs: Vec<&str> = crash["breadcrumbs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["name"].as_str().unwrap())
        .collect();
    assert_eq!(crumbs, ["session_start", "save_loaded"]);
    // The caller's frame is first and counts as the game's.
    let top = &crash["frames"][0];
    assert!(
        top["function"].as_str().unwrap().starts_with("crashes::"),
        "{top}"
    );
    assert_eq!(top["inApp"], true);

    let puts = fake.puts.lock().unwrap();
    let mut names: Vec<&str> = puts.iter().map(|p| p.filename.as_str()).collect();
    names.sort_unstable();
    assert_eq!(names, ["game.log", "save.json"]);
    let save = puts.iter().find(|p| p.filename == "save.json").unwrap();
    assert_eq!(save.bytes, br#"{"gold":12}"#);
    assert_eq!(save.content_type, "application/json");
    let id = crash["id"].as_str().unwrap();
    assert!(
        save.path
            .starts_with(&format!("/v1/crashes/{id}/attachments/"))
    );
}

#[test]
fn messages_default_to_info() {
    let fake = Fake::new();
    let roost = Roost::start(config(&fake)).unwrap();
    roost.capture_message("Save fell back to defaults", Capture::new());
    roost.flush();
    let crash = &fake.crashes()[0];
    assert_eq!(
        (crash["kind"].as_str(), crash["level"].as_str()),
        (Some("message"), Some("info"))
    );
    assert_eq!(crash["type"], "Message");
}

#[test]
fn before_send_can_drop_or_edit_reports() {
    let fake = Fake::new();
    let cfg = config(&fake).before_send(|mut crash| {
        if crash.message.contains("ignore") {
            return None;
        }
        crash.attachments.clear();
        crash.tags.insert("scrubbed".into(), "yes".into());
        Some(crash)
    });
    let roost = Roost::start(cfg).unwrap();
    roost.capture_message("ignore me", Capture::new());
    roost.capture_message(
        "keep me",
        Capture::new().attachment(Attachment::new("save.bin", vec![1, 2, 3])),
    );
    roost.flush();

    let crashes = fake.crashes();
    assert_eq!(crashes.len(), 1);
    assert_eq!(crashes[0]["tags"]["scrubbed"], "yes");
    assert!(fake.puts.lock().unwrap().is_empty());
}

#[test]
fn trims_reports_to_the_contract_instead_of_failing() {
    let fake = Fake::new();
    let roost = Roost::start(config(&fake)).unwrap();
    roost.set_tag("bad key!", "x");
    roost.set_tag("long", "v".repeat(500));
    roost.set_extra("huge", "x".repeat(70_000));
    let big = Attachment::new("big.bin", vec![0u8; roost_sdk::MAX_ATTACHMENT_BYTES + 1]);
    roost.capture_message("m".repeat(5000), Capture::new().attachment(big));
    roost.flush();

    let crash = &fake.crashes()[0];
    assert!(crash["tags"].get("bad key!").is_none());
    assert_eq!(crash["tags"]["long"].as_str().unwrap().len(), 200);
    assert_eq!(crash["message"].as_str().unwrap().len(), 2000);
    assert!(crash["extra"]["truncated"].is_string());
    assert!(crash["attachments"].as_array().unwrap().is_empty());
}
