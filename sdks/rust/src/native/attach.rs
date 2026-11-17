//! The game side: launch the monitor, connect to it, install the crash handler, and keep
//! the monitor's copy of the scope fresh.

use super::MONITOR_FLAG;
use super::pending::dump_dir;
use super::snapshot::{CHUNK_BYTES, MSG_CHUNK, MSG_COMMIT, MSG_RESET};
use crash_handler::{CrashContext, CrashEventResult, CrashHandler};
use minidumper::{Client, SocketName};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

/// How long `Roost::start` waits for the monitor to come up.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const CONNECT_RETRY: Duration = Duration::from_millis(20);
/// How often the scope is checked for changes and re-sent.
const SNAPSHOT_EVERY: Duration = Duration::from_secs(1);

/// Keeps native capture alive. Dropping it detaches the handler and lets the monitor exit.
pub(crate) struct Guard {
    stop: Option<Sender<()>>,
    thread: Option<JoinHandle<()>>,
    handler: Option<CrashHandler>,
    _monitor: Child,
}

impl Drop for Guard {
    fn drop(&mut self) {
        self.handler.take();
        self.stop.take();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// Starts native crash capture. `None` (and the game carries on without it) on any failure.
/// `snapshot` returns the current scope as JSON, or `None` once the client is gone.
pub(crate) fn attach(
    data_dir: &Path,
    snapshot: impl Fn() -> Option<Vec<u8>> + Send + 'static,
) -> Option<Guard> {
    let dumps = dump_dir(data_dir);
    std::fs::create_dir_all(&dumps).ok()?;
    let socket = socket_path();
    let mut monitor = spawn_monitor(&socket, &dumps)?;
    let Some(client) = connect(&socket, &mut monitor) else {
        let _ = monitor.kill();
        let _ = monitor.wait();
        return None;
    };
    let client = Arc::new(client);
    // The first snapshot goes before the handler, so even an instant crash has a scope.
    let mut last = snapshot();
    if let Some(bytes) = &last {
        send_snapshot(&client, bytes);
    }
    let Some(handler) = install_handler(Arc::clone(&client), &monitor) else {
        let _ = monitor.kill();
        let _ = monitor.wait();
        return None;
    };
    let (stop, stopped) = mpsc::channel::<()>();
    let thread = thread::Builder::new()
        .name("roost-native".to_owned())
        .spawn(move || {
            // Wakes every second; a dropped sender (the guard going away) ends the loop.
            while let Err(RecvTimeoutError::Timeout) = stopped.recv_timeout(SNAPSHOT_EVERY) {
                let Some(now) = snapshot() else { return };
                if last.as_ref() != Some(&now) {
                    send_snapshot(&client, &now);
                    last = Some(now);
                }
            }
        })
        .ok();
    Some(Guard {
        stop: Some(stop),
        thread,
        handler: Some(handler),
        _monitor: monitor,
    })
}

/// Unique per process. Unix socket paths are capped near 104 bytes, so it stays short.
fn socket_path() -> PathBuf {
    let name = format!(
        "roost-{}-{}.sock",
        std::process::id(),
        &uuid::Uuid::new_v4().simple().to_string()[..8]
    );
    let dir = std::env::temp_dir();
    if cfg!(unix) && dir.join(&name).as_os_str().len() >= 100 {
        return Path::new("/tmp").join(name);
    }
    dir.join(name)
}

fn spawn_monitor(socket: &Path, dumps: &Path) -> Option<Child> {
    let exe = std::env::current_exe().ok()?;
    let mut command = Command::new(exe);
    command
        .arg(MONITOR_FLAG)
        .arg(socket)
        .arg(dumps)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: a GUI game must not flash a console for its monitor.
        command.creation_flags(0x0800_0000);
    }
    command.spawn().ok()
}

/// Retries until the monitor's socket is up, giving up early if the monitor died.
fn connect(socket: &Path, monitor: &mut Child) -> Option<Client> {
    let deadline = Instant::now() + CONNECT_TIMEOUT;
    while Instant::now() < deadline {
        if let Ok(client) = Client::with_name(SocketName::Path(socket)) {
            return Some(client);
        }
        if !matches!(monitor.try_wait(), Ok(None)) {
            return None;
        }
        thread::sleep(CONNECT_RETRY);
    }
    None
}

fn install_handler(client: Arc<Client>, monitor: &Child) -> Option<CrashHandler> {
    let on_crash = move |context: &CrashContext| {
        // On macOS messages and the dump request travel on different channels; a ping
        // makes sure the last snapshot has landed before the monitor writes the dump.
        let _ = client.ping();
        CrashEventResult::Handled(client.request_dump(context).is_ok())
    };
    // SAFETY: the closure runs in a crashed process. It only does IPC on a client that was
    // fully set up beforehand (no locks, no work beyond the two sends minidumper documents
    // for exactly this use).
    let event = unsafe { crash_handler::make_crash_event(on_crash) };
    let handler = CrashHandler::attach(event).ok()?;
    // Yama ptrace restrictions: only the monitor may read this process's memory.
    #[cfg(any(target_os = "linux", target_os = "android"))]
    handler.set_ptracer(Some(monitor.id()));
    #[cfg(not(any(target_os = "linux", target_os = "android")))]
    let _ = monitor;
    Some(handler)
}

/// Reset, small chunks, commit: see `snapshot::MSG_RESET`.
fn send_snapshot(client: &Client, bytes: &[u8]) {
    if client.send_message(MSG_RESET, [0u8; 0]).is_err() {
        return;
    }
    for chunk in bytes.chunks(CHUNK_BYTES) {
        if client.send_message(MSG_CHUNK, chunk).is_err() {
            return;
        }
    }
    let _ = client.send_message(MSG_COMMIT, [0u8; 0]);
}
