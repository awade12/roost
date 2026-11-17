//! A game that really crashes. This binary plays three parts, picked by its arguments:
//! - the crash monitor (`--roost-crash-monitor …`, launched by the SDK),
//! - the crashing game (`ROOST_CRASH_MODE` set),
//! - the test: runs the game, checks the dump on disk, then that the next launch uploads it.
//!
//! Runs on macOS, Linux and Windows (`cargo test --features native-crashes`).
#![allow(clippy::unwrap_used, clippy::panic)]
mod common;

use common::{Fake, config, temp_dir};
use roost_sdk::{Breadcrumb, Roost};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

fn main() {
    // Same two lines a game uses.
    if roost_sdk::native::run_monitor_if_requested() {
        return;
    }
    if let (Ok(mode), Ok(dir)) = (
        std::env::var("ROOST_CRASH_MODE"),
        std::env::var("ROOST_CRASH_DIR"),
    ) {
        crashing_game(&mode, Path::new(&dir));
        return;
    }
    for mode in ["segfault", "abort"] {
        let dir = temp_dir(&format!("native-{mode}"));
        let dump = run_game_until_it_crashes(mode, &dir);
        check_next_launch_uploads(&dir, &dump);
        println!("native_crash {mode}: ok");
    }
    monitor_exits_with_the_game();
    println!("native_crash clean exit: ok");
}

fn crashing_game(mode: &str, dir: &Path) {
    let fake = Fake::new();
    fake.set_offline(true);
    let roost = Roost::start(config(&fake).data_dir(dir).native_crashes(true)).unwrap();
    roost.set_tag("level", "forest-3");
    roost.add_breadcrumb(Breadcrumb::new("boss_spawned").category("game"));
    // Snapshots go to the monitor once a second; let this one land.
    std::thread::sleep(Duration::from_millis(1500));
    if mode == "exit" {
        return;
    }
    if mode == "abort" {
        std::process::abort();
    }
    // A real access violation. Address 16 is never mapped (page zero) on any desktop OS.
    // Not null: debug builds check null writes and would panic instead of faulting.
    #[allow(unsafe_code)]
    // SAFETY: none; crashing is the point of this test.
    unsafe {
        std::ptr::without_provenance_mut::<u32>(16).write_volatile(1);
    }
    panic!("the write above should have crashed the process");
}

fn run_game_until_it_crashes(mode: &str, dir: &Path) -> PathBuf {
    let mut game = Command::new(std::env::current_exe().unwrap())
        .env("ROOST_CRASH_MODE", mode)
        .env("ROOST_CRASH_DIR", dir)
        .spawn()
        .unwrap();
    let status = wait_for(Duration::from_secs(60), || game.try_wait().unwrap()).unwrap();
    assert!(!status.success(), "{mode}: the game should have crashed");

    let dumps = dir.join("roost/minidumps");
    // The monitor may still be renaming the finished dump into place.
    let dump = wait_for(Duration::from_secs(15), || {
        std::fs::read_dir(&dumps)
            .ok()?
            .flatten()
            .map(|e| e.path())
            .find(|p| p.extension().is_some_and(|e| e == "dmp"))
    })
    .unwrap_or_else(|| panic!("{mode}: no .dmp in {}", dumps.display()));

    let bytes = std::fs::read(&dump).unwrap();
    assert_eq!(&bytes[..4], b"MDMP", "{mode}: minidump magic");
    let sidecar: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dump.with_extension("json")).unwrap()).unwrap();
    assert_eq!(sidecar["tags"]["level"], "forest-3", "{mode}: {sidecar}");
    assert_eq!(sidecar["playerId"], "player-1");
    assert!(sidecar["sessionId"].as_str().is_some_and(|s| !s.is_empty()));
    assert!(sidecar["context"]["build"].is_string());
    let crumbs = sidecar["breadcrumbs"].as_array().unwrap();
    assert!(crumbs.iter().any(|c| c["name"] == "boss_spawned"));
    dump
}

fn check_next_launch_uploads(dir: &Path, dump: &Path) {
    let id = dump.file_stem().unwrap().to_str().unwrap().to_owned();
    let size = std::fs::metadata(dump).unwrap().len();
    let fake = Fake::new();
    let roost = Roost::start(config(&fake).data_dir(dir)).unwrap();
    assert!(roost.flush());
    let body = &fake.bodies("/v1/minidumps")[0];
    assert_eq!(body["report"]["id"], id.as_str());
    assert_eq!(body["report"]["dumpSize"], size);
    assert_eq!(body["report"]["tags"]["level"], "forest-3");
    {
        let puts = fake.puts.lock().unwrap();
        assert_eq!(puts[0].path, format!("/v1/minidumps/{id}/dump"));
        assert!(puts[0].bytes.starts_with(b"MDMP"));
    }
    assert!(!dump.exists() && !dump.with_extension("json").exists());
}

/// A game that quits normally leaves no dump, and its monitor goes away (it removes its
/// socket, named after the game's pid, on the way out).
fn monitor_exits_with_the_game() {
    let dir = temp_dir("native-exit");
    let mut game = Command::new(std::env::current_exe().unwrap())
        .env("ROOST_CRASH_MODE", "exit")
        .env("ROOST_CRASH_DIR", &dir)
        .spawn()
        .unwrap();
    let pid = game.id();
    assert!(game.wait().unwrap().success());
    let socket_prefix = format!("roost-{pid}-");
    let gone = wait_for(Duration::from_secs(10), || {
        let left = [std::env::temp_dir(), PathBuf::from("/tmp")]
            .iter()
            .filter_map(|d| std::fs::read_dir(d).ok())
            .flatten()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().starts_with(&socket_prefix));
        (!left).then_some(())
    });
    assert!(gone.is_some(), "the monitor outlived the game");
    let dumps = std::fs::read_dir(dir.join("roost/minidumps"))
        .unwrap()
        .count();
    assert_eq!(dumps, 0);
}

fn wait_for<T>(limit: Duration, mut check: impl FnMut() -> Option<T>) -> Option<T> {
    let start = Instant::now();
    while start.elapsed() < limit {
        if let Some(value) = check() {
            return Some(value);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    None
}
