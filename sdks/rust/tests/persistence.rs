#![allow(clippy::unwrap_used)]
mod common;

use common::{Fake, config, temp_dir};
use roost_sdk::{Attachment, Capture, Roost};

#[test]
fn unsent_events_and_reports_survive_a_restart() {
    let dir = temp_dir("persist");
    let offline = Fake::new();
    offline.set_offline(true);
    {
        let roost = Roost::start(config(&offline).data_dir(&dir)).unwrap();
        roost.track("played_offline");
        roost.capture_message(
            "offline report",
            Capture::new().attachment(Attachment::new("save.json", "{}")),
        );
        roost.shutdown();
    }
    assert!(dir.join("roost/events.json").exists());
    assert_eq!(
        std::fs::read_dir(dir.join("roost/crashes"))
            .unwrap()
            .count(),
        1
    );

    let online = Fake::new();
    let roost = Roost::start(config(&online).data_dir(&dir)).unwrap();
    roost.flush();
    let names = online.event_names();
    assert!(
        names.starts_with(&["session_start".to_owned(), "played_offline".to_owned()]),
        "{names:?}"
    );
    assert_eq!(online.crashes()[0]["message"], "offline report");
    assert_eq!(online.puts.lock().unwrap()[0].filename, "save.json");
    assert_eq!(
        std::fs::read_dir(dir.join("roost/crashes"))
            .unwrap()
            .count(),
        0
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_failed_upload_retries_the_whole_report() {
    let fake = Fake::new();
    let roost = Roost::start(config(&fake)).unwrap();
    roost.capture_message(
        "with file",
        Capture::new().attachment(Attachment::new("a.txt", "hi")),
    );
    // POST works, PUT fails: keep it.
    fake.set_offline(true);
    roost.flush();
    fake.set_offline(false);
    roost.flush();
    assert!(!fake.crashes().is_empty());
    assert_eq!(fake.puts.lock().unwrap().len(), 1);
}
