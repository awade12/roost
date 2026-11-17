//! Uploading minidumps left by an earlier run, through the fake API.
#![allow(clippy::unwrap_used)]
mod common;

use common::{Fake, config, temp_dir};
use roost_sdk::{Attachment, Roost};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const ID: &str = "6f1c0a52-3c1e-4e8e-9a59-8f8f0d1b2c3d";

const SIDECAR: &str = r#"{
    "context": { "build": "1.4.1", "platform": "macos", "sdk": "rust/0.2.0" },
    "sessionId": "sess-crashed", "playerId": "player-1",
    "tags": { "level": "forest-3" },
    "contexts": { "match": { "round": 3 } },
    "extra": { "saveVersion": 7 },
    "breadcrumbs": [{ "name": "boss_spawned", "ts": "2026-11-16T09:59:00.000Z" }]
}"#;

fn dumps(dir: &Path) -> PathBuf {
    dir.join("roost/minidumps")
}

/// A fake dump (just the magic and some bytes) and, optionally, its sidecar.
fn write_dump(dir: &Path, id: &str, sidecar: Option<&str>) {
    let d = dumps(dir);
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join(format!("{id}.dmp")), b"MDMP\x93\xa7rest-of-dump").unwrap();
    if let Some(json) = sidecar {
        std::fs::write(d.join(format!("{id}.json")), json).unwrap();
    }
}

fn start(fake: &Arc<Fake>, dir: &Path) -> Roost {
    let cfg = config(fake)
        .data_dir(dir)
        .attachments(|| vec![Attachment::new("save.json", br#"{"gold":12}"#.to_vec())]);
    let roost = Roost::start(cfg).unwrap();
    assert!(roost.flush());
    roost
}

fn left_on_disk(dir: &Path) -> usize {
    std::fs::read_dir(dumps(dir))
        .map(|e| e.count())
        .unwrap_or(0)
}

#[test]
fn sends_report_dump_and_files_then_deletes() {
    let dir = temp_dir("md-ok");
    write_dump(&dir, ID, Some(SIDECAR));
    let fake = Fake::new();
    let _roost = start(&fake, &dir);

    let body = &fake.bodies("/v1/minidumps")[0];
    assert_eq!(body["context"]["build"], "1.4.1", "context from crash time");
    let r = &body["report"];
    assert_eq!(r["id"], ID);
    assert!(r["ts"].as_str().unwrap().ends_with('Z'));
    assert_eq!(r["playerId"], "player-1");
    assert_eq!(r["sessionId"], "sess-crashed");
    assert_eq!(r["tags"]["level"], "forest-3");
    assert_eq!(r["contexts"]["match"]["round"], 3);
    assert_eq!(r["extra"]["saveVersion"], 7);
    assert_eq!(r["breadcrumbs"][0]["name"], "boss_spawned");
    assert_eq!(r["dumpSize"], 18);
    assert_eq!(r["attachments"][0]["name"], "save.json");

    let puts = fake.puts.lock().unwrap();
    let dump = &puts[0];
    assert_eq!(dump.path, format!("/v1/minidumps/{ID}/dump"));
    assert_eq!(dump.content_type, "application/x-minidump");
    assert!(dump.bytes.starts_with(b"MDMP"));
    let file_id = r["attachments"][0]["id"].as_str().unwrap();
    assert_eq!(
        puts[1].path,
        format!("/v1/crashes/{ID}/attachments/{file_id}")
    );
    assert_eq!(puts[1].bytes, br#"{"gold":12}"#);
    assert_eq!(left_on_disk(&dir), 0);
}

#[test]
fn without_a_sidecar_uses_the_current_context() {
    let dir = temp_dir("md-bare");
    write_dump(&dir, ID, None);
    let fake = Fake::new();
    let _roost = start(&fake, &dir);
    let r = &fake.bodies("/v1/minidumps")[0];
    assert_eq!(r["context"]["build"], "1.0.0");
    assert_eq!(r["report"]["playerId"], "player-1");
    assert!(r["report"].get("sessionId").is_none());
    assert_eq!(left_on_disk(&dir), 0);
}

#[test]
fn keeps_dumps_when_offline_or_the_server_is_down() {
    for (offline, status) in [(true, 202), (false, 503), (false, 429)] {
        let dir = temp_dir("md-retry");
        write_dump(&dir, ID, Some(SIDECAR));
        let fake = Fake::new();
        fake.set_offline(offline);
        fake.set_status(status);
        drop(start(&fake, &dir));
        assert_eq!(left_on_disk(&dir), 2, "offline={offline} status={status}");
    }
}

#[test]
fn keeps_the_dump_when_its_upload_fails() {
    let dir = temp_dir("md-put");
    write_dump(&dir, ID, Some(SIDECAR));
    // POST works, then the PUT never gets an answer: next launch tries again.
    struct PostOnly(Arc<Fake>);
    impl roost_sdk::Transport for PostOnly {
        fn post_json(&self, path: &str, body: &str) -> Result<roost_sdk::Reply, String> {
            self.0.post_json(path, body)
        }
        fn put_bytes(
            &self,
            _: &str,
            _: &str,
            _: &str,
            _: &[u8],
        ) -> Result<roost_sdk::Reply, String> {
            Err("timeout".to_owned())
        }
    }
    let fake = Fake::new();
    let roost = Roost::start(
        config(&fake)
            .data_dir(&dir)
            .transport(Arc::new(PostOnly(Arc::clone(&fake)))),
    )
    .unwrap();
    assert!(roost.flush());
    assert_eq!(fake.bodies("/v1/minidumps").len(), 1);
    assert_eq!(left_on_disk(&dir), 2);
}

#[test]
fn drops_rejected_and_empty_dumps() {
    let dir = temp_dir("md-reject");
    write_dump(&dir, ID, Some(SIDECAR));
    let fake = Fake::new();
    fake.set_status(400);
    drop(start(&fake, &dir));
    assert_eq!(fake.bodies("/v1/minidumps").len(), 1);
    assert_eq!(left_on_disk(&dir), 0);

    let dir = temp_dir("md-empty");
    std::fs::create_dir_all(dumps(&dir)).unwrap();
    std::fs::write(dumps(&dir).join(format!("{ID}.dmp")), b"").unwrap();
    let fake = Fake::new();
    drop(start(&fake, &dir));
    assert!(fake.bodies("/v1/minidumps").is_empty());
    assert_eq!(left_on_disk(&dir), 0);
}

#[test]
fn keeps_at_most_ten_dumps() {
    let dir = temp_dir("md-cap");
    for i in 0..12 {
        write_dump(
            &dir,
            &format!("00000000-0000-4000-8000-0000000000{i:02}"),
            None,
        );
    }
    let fake = Fake::new();
    fake.set_offline(true);
    drop(start(&fake, &dir));
    assert_eq!(left_on_disk(&dir), 10);
}
