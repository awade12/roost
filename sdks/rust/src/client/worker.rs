use super::shared::{Shared, lock};
use crate::model::DeviceContext;
use crate::transport::{MAX_PENDING_CRASHES, Outcome, PendingCrash, Transport, outcome};
use std::sync::Arc;
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender};
use std::thread::{self, JoinHandle};

/// Contract limit (`MAX_EVENTS_PER_BATCH`).
const EVENTS_PER_BATCH: usize = 500;
/// Batches per tick, so a big backlog drains without one tick running forever.
const BATCHES_PER_TICK: usize = 10;

pub(crate) enum Msg {
    Crash(Box<PendingCrash>),
    Flush(Option<SyncSender<()>>),
    Stop(SyncSender<()>),
    RefreshFlags(SyncSender<bool>),
}

/// All network I/O happens on this one thread, so the game never waits on it.
pub(crate) fn spawn(
    shared: Arc<Shared>,
    rx: Receiver<Msg>,
    pending: Vec<PendingCrash>,
) -> std::io::Result<JoinHandle<()>> {
    thread::Builder::new()
        .name("roost-sdk".to_owned())
        .spawn(move || {
            #[cfg(feature = "native-crashes")]
            upload_minidumps(&shared);
            Worker { shared, pending }.run(&rx);
        })
}

/// Hard crashes from earlier runs. Once per launch: a dump that fails waits for the next one.
#[cfg(feature = "native-crashes")]
fn upload_minidumps(shared: &Shared) {
    let Some(dir) = shared.config.data_dir.as_deref() else {
        return;
    };
    let fallback = crate::native::Fallback {
        player_id: &shared.config.player_id,
        context: serde_json::to_value(shared.context()).unwrap_or_default(),
    };
    let files = || {
        shared
            .config
            .attachments
            .as_ref()
            .map(|f| f())
            .unwrap_or_default()
    };
    crate::native::upload_pending(shared.transport.as_ref(), dir, &fallback, files);
}

struct Worker {
    shared: Arc<Shared>,
    pending: Vec<PendingCrash>,
}

impl Worker {
    fn run(mut self, rx: &Receiver<Msg>) {
        let interval = self.shared.config.flush_interval;
        loop {
            // Flags refresh on the same thread as everything else, so the game never waits on them.
            if self.shared.flags.due(self.shared.config.config_refresh) {
                self.shared.flags.refresh(
                    self.shared.transport.as_ref(),
                    &self.shared.config.player_id,
                );
            }
            match rx.recv_timeout(interval) {
                Ok(Msg::RefreshFlags(done)) => {
                    let changed = self.shared.flags.refresh(
                        self.shared.transport.as_ref(),
                        &self.shared.config.player_id,
                    );
                    let _ = done.send(changed);
                }
                Ok(Msg::Crash(p)) => {
                    if self.pending.len() < MAX_PENDING_CRASHES {
                        self.pending.push(*p);
                    }
                    self.send_crashes();
                }
                Ok(Msg::Flush(done)) => {
                    self.flush();
                    if let Some(done) = done {
                        let _ = done.send(());
                    }
                }
                Ok(Msg::Stop(done)) => {
                    self.flush();
                    let _ = done.send(());
                    return;
                }
                Err(RecvTimeoutError::Timeout) => self.flush(),
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    fn flush(&mut self) {
        self.send_crashes();
        self.send_events();
    }

    fn send_events(&self) {
        let shared = &self.shared;
        let context = shared.context();
        for _ in 0..BATCHES_PER_TICK {
            let batch = lock(&shared.queue).peek(EVENTS_PER_BATCH);
            if batch.is_empty() {
                break;
            }
            let body = serde_json::json!({ "context": context, "events": batch }).to_string();
            // Rejected batches are dropped too: a bad one would otherwise block the queue forever.
            if outcome(&shared.transport.post_json("/v1/events", &body)) == Outcome::Retry {
                break;
            }
            lock(&shared.queue).drop_front(batch.len());
        }
        let left = lock(&shared.queue).all();
        shared.store.save_events(&left);
    }

    fn send_crashes(&mut self) {
        let shared = &self.shared;
        let context = shared.context();
        self.pending.retain(|p| {
            let keep = deliver_crash(shared.transport.as_ref(), &context, p) == Outcome::Retry;
            if !keep {
                shared.store.remove_crash(&p.crash.id);
            }
            keep
        });
    }
}

/// POSTs the report, then PUTs each file. Retrying is safe: the server stores a report id once.
pub(crate) fn deliver_crash(
    transport: &dyn Transport,
    context: &DeviceContext,
    pending: &PendingCrash,
) -> Outcome {
    let body = serde_json::json!({ "context": context, "crashes": [&pending.crash] }).to_string();
    let first = outcome(&transport.post_json("/v1/crashes", &body));
    if first != Outcome::Sent {
        return first;
    }
    for (id, bytes) in &pending.files {
        let Some(meta) = pending.crash.attachments.iter().find(|a| &a.id == id) else {
            continue;
        };
        let path = format!("/v1/crashes/{}/attachments/{id}", pending.crash.id);
        if outcome(&transport.put_bytes(&path, &meta.name, &meta.content_type, bytes))
            == Outcome::Retry
        {
            return Outcome::Retry;
        }
    }
    Outcome::Sent
}
