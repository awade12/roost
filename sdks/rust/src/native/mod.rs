//! Native crash capture (segfaults, aborts, stack overflows, access violations) as minidumps.
//!
//! A hard crash leaves nothing safe to run in the game process, so the game re-launches its
//! own executable as a small monitor process ([`run_monitor_if_requested`]). When the game
//! crashes, `crash-handler` catches it and asks the monitor (over `minidumper`'s IPC) to
//! write `<data_dir>/roost/minidumps/<uuid>.dmp`, plus `<uuid>.json` with the last scope
//! snapshot. The next launch uploads both.

mod attach;
mod monitor;
mod pending;
mod snapshot;

pub(crate) use attach::{Guard, attach};
pub(crate) use pending::{Fallback, upload_pending};
pub(crate) use snapshot::Snapshot;

/// The argument that marks a process as the crash monitor:
/// `<game exe> --roost-crash-monitor <socket-name> <dump-dir>`.
pub(crate) const MONITOR_FLAG: &str = "--roost-crash-monitor";

/// Call this first thing in `main()`. If this process was launched by the SDK as the crash
/// monitor, it runs the monitor until the game exits and returns `true`: `main` should then
/// return straight away. In the game itself it returns `false` at once.
///
/// ```no_run
/// // First thing in `main`:
/// if roost_sdk::native::run_monitor_if_requested() {
///     return;
/// }
/// // … start the game …
/// ```
pub fn run_monitor_if_requested() -> bool {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new(MONITOR_FLAG)) {
        return false;
    }
    // Even with bad arguments this is the monitor, never a second copy of the game.
    if let (Some(socket), Some(dir)) = (args.next(), args.next()) {
        monitor::run(socket.as_ref(), dir.as_ref());
    }
    true
}
