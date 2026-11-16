//! Its own test binary: the panic hook is process-wide.
#![allow(clippy::unwrap_used, clippy::panic)]
mod common;

use common::{Fake, config, temp_dir};
use roost_sdk::{Attachment, Roost};

fn explode_in_game_code() {
    let slots: Vec<u32> = Vec::new();
    let _ = slots
        .get(3)
        .copied()
        .unwrap_or_else(|| panic!("no save in slot 3"));
}

#[test]
fn panics_are_reported_with_frames_thread_and_save() {
    let dir = temp_dir("panic");
    let fake = Fake::new();
    let cfg = config(&fake)
        .capture_panics(true)
        .data_dir(&dir)
        .in_app("panic::")
        .attachments(|| vec![Attachment::new("save.json", r#"{"slot":3}"#)]);
    let roost = Roost::start(cfg).unwrap();
    roost.set_tag("level", "forest-3");

    let joined = std::thread::Builder::new()
        .name("loader".into())
        .spawn(explode_in_game_code)
        .unwrap()
        .join();
    assert!(joined.is_err());
    assert!(roost.flush());

    let crash = &fake.crashes()[0];
    assert_eq!(crash["kind"], "crash");
    assert_eq!(crash["level"], "fatal");
    assert_eq!(crash["type"], "panic");
    assert_eq!(crash["message"], "no save in slot 3");
    assert_eq!(crash["tags"]["thread"], "loader");
    assert_eq!(crash["tags"]["level"], "forest-3");
    assert!(
        crash["stack"]
            .as_str()
            .unwrap()
            .starts_with("panicked at tests/panic.rs:")
    );
    let in_app: Vec<&str> = crash["frames"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|f| f["inApp"] == true)
        .map(|f| f["function"].as_str().unwrap())
        .collect();
    assert!(
        in_app
            .iter()
            .any(|f| f.starts_with("panic::explode_in_game_code")),
        "{in_app:?}"
    );
    assert_eq!(fake.puts.lock().unwrap()[0].bytes, br#"{"slot":3}"#);

    // Sent, so nothing is left on disk for next launch.
    assert_eq!(
        std::fs::read_dir(dir.join("roost/crashes"))
            .unwrap()
            .count(),
        0
    );
    roost.shutdown();
    let _ = std::fs::remove_dir_all(dir);
}
