//! The monitor process: a minidumper server that writes a dump when the game crashes.

use super::pending::{MAX_PENDING_DUMPS, prune, sidecar};
use super::snapshot::{MSG_CHUNK, MSG_COMMIT, MSG_RESET};
use minidumper::{LoopAction, MinidumpBinary, Server, ServerHandler, SocketName};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

/// If the game never connects (it failed to start up, or gave up waiting), stop.
const CONNECT_GRACE: Duration = Duration::from_secs(30);

/// Runs until the game disconnects (exit or crash). Every failure just ends the monitor:
/// it has no one to report to.
pub(crate) fn run(socket: &Path, dump_dir: &Path) {
    let Ok(mut server) = Server::with_name(SocketName::Path(socket)) else {
        return;
    };
    let shutdown = Arc::new(AtomicBool::new(false));
    let connected = Arc::new(AtomicBool::new(false));
    watch_for_no_client(Arc::clone(&shutdown), Arc::clone(&connected));
    let handler = Handler {
        dump_dir: dump_dir.to_owned(),
        connected,
        pending: Mutex::new(Vec::new()),
        latest: Mutex::new(None),
        current: Mutex::new(None),
    };
    let _ = server.run(Box::new(handler), &shutdown, None);
    // minidumper removes the socket file only on a clean drop; make sure.
    drop(server);
    let _ = fs::remove_file(socket);
}

fn watch_for_no_client(shutdown: Arc<AtomicBool>, connected: Arc<AtomicBool>) {
    let _ = std::thread::Builder::new()
        .name("roost-monitor-watch".to_owned())
        .spawn(move || {
            std::thread::sleep(CONNECT_GRACE);
            if !connected.load(Ordering::Acquire) {
                shutdown.store(true, Ordering::Release);
            }
        });
}

struct Handler {
    dump_dir: PathBuf,
    connected: Arc<AtomicBool>,
    /// Snapshot chunks received since the last reset.
    pending: Mutex<Vec<u8>>,
    /// The last complete snapshot, written next to the dump.
    latest: Mutex<Option<Vec<u8>>>,
    /// `(partial path, final path)` of the dump being written.
    current: Mutex<Option<(PathBuf, PathBuf)>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Handler {
    /// The sidecar first, then the dump renamed into place: the uploader only looks at
    /// `.dmp` files, so it never sees a half-written dump or a dump without its scope.
    fn finish(&self, mut binary: MinidumpBinary) {
        let _ = binary.file.flush();
        let _ = binary.file.sync_all();
        drop(binary.file);
        let Some((partial, done)) = lock(&self.current).take() else {
            return;
        };
        if let Some(json) = lock(&self.latest).as_deref() {
            let _ = fs::write(sidecar(&done), json);
        }
        let _ = fs::rename(&partial, &done);
    }
}

impl ServerHandler for Handler {
    fn create_minidump_file(&self) -> Result<(File, PathBuf), std::io::Error> {
        fs::create_dir_all(&self.dump_dir)?;
        // Room for this one within the cap.
        prune(&self.dump_dir, MAX_PENDING_DUMPS.saturating_sub(1));
        let id = uuid::Uuid::new_v4().to_string();
        let done = self.dump_dir.join(format!("{id}.dmp"));
        let partial = self.dump_dir.join(format!("{id}.dmp.partial"));
        let file = File::create(&partial)?;
        *lock(&self.current) = Some((partial.clone(), done));
        Ok((file, partial))
    }

    fn on_minidump_created(&self, result: Result<MinidumpBinary, minidumper::Error>) -> LoopAction {
        match result {
            Ok(binary) => self.finish(binary),
            Err(_) => {
                if let Some((partial, _)) = lock(&self.current).take() {
                    let _ = fs::remove_file(partial);
                }
            }
        }
        // The game is gone after a crash; nothing left to watch.
        LoopAction::Exit
    }

    fn on_message(&self, kind: u32, buffer: Vec<u8>) {
        match kind {
            MSG_RESET => lock(&self.pending).clear(),
            MSG_CHUNK => lock(&self.pending).extend_from_slice(&buffer),
            MSG_COMMIT => {
                let json = std::mem::take(&mut *lock(&self.pending));
                // A chunk lost or split in transit leaves bad JSON: keep the previous one.
                if serde_json::from_slice::<serde_json::Value>(&json).is_ok() {
                    *lock(&self.latest) = Some(json);
                }
            }
            _ => {}
        }
    }

    fn on_client_connected(&self, _num_clients: usize) -> LoopAction {
        self.connected.store(true, Ordering::Release);
        LoopAction::Continue
    }

    fn on_client_disconnected(&self, num_clients: usize) -> LoopAction {
        if num_clients == 0 {
            LoopAction::Exit
        } else {
            LoopAction::Continue
        }
    }
}
