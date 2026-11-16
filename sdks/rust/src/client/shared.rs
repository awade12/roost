use super::config::Config;
use super::worker::{Msg, deliver_crash};
use crate::crash::{Attachment, Capture, PANIC_ATTACHMENT_BUDGET, Raw, Scope, Who, build};
use crate::model::{
    Breadcrumb, DeviceContext, Event, TrackEvent, is_valid_event_name, new_id, now_rfc3339,
};
use crate::transport::{PendingCrash, Queue, Store, Transport};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, TryLockError};

pub(crate) const SDK_VERSION: &str = concat!("rust/", env!("CARGO_PKG_VERSION"));

/// State shared by the game threads, the worker thread and the panic hook.
pub(crate) struct Shared {
    pub config: Config,
    pub session_id: String,
    pub queue: Mutex<Queue>,
    pub scope: Mutex<Scope>,
    pub store: Store,
    pub transport: Arc<dyn Transport>,
    /// `Sender` is `Sync`, so the panic hook can send without taking a lock.
    pub tx: Sender<Msg>,
    pub active: AtomicBool,
}

/// A panic elsewhere must not stop the SDK, so poisoned locks are used as-is.
pub(crate) fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Shared {
    pub(crate) fn context(&self) -> DeviceContext {
        let c = &self.config;
        DeviceContext {
            build: c.build.clone(),
            platform: c.platform,
            os_version: c.os_version.clone(),
            device_model: c.device_model.clone(),
            locale: c.locale.clone(),
            sdk: SDK_VERSION.to_owned(),
        }
    }

    pub(crate) fn send(&self, msg: Msg) {
        let _ = self.tx.send(msg);
    }

    pub(crate) fn track(&self, event: TrackEvent) {
        if !is_valid_event_name(&event.name) {
            return;
        }
        let ts = now_rfc3339();
        let mut crumb = Breadcrumb::new(&event.name).category("event");
        crumb.ts.clone_from(&ts);
        crumb.props = (!event.props.is_empty()).then(|| event.props.clone());
        lock(&self.scope).add_breadcrumb(crumb);
        lock(&self.queue).push(Event {
            id: new_id(),
            name: event.name,
            ts,
            session_id: self.session_id.clone(),
            player_id: self.config.player_id.clone(),
            value: event.value,
            props: event.props,
        });
    }

    /// Builds a report, saves it to disk, and hands it to the worker.
    /// From the panic hook (`from_panic`) it never blocks on a lock another thread holds,
    /// and with no data dir it sends right away, since the process may be about to end.
    pub(crate) fn capture(&self, raw: Raw, capture: Capture, from_panic: bool) {
        let scope = if from_panic {
            self.scope_without_blocking()
        } else {
            lock(&self.scope).clone()
        };
        let files: Vec<Attachment> = self
            .config
            .attachments
            .as_ref()
            .map(|f| f())
            .unwrap_or_default();
        let budget = if from_panic {
            PANIC_ATTACHMENT_BUDGET
        } else {
            usize::MAX
        };
        let who = Who {
            session_id: &self.session_id,
            player_id: &self.config.player_id,
        };
        let Some(pending) = self.before_send(build(raw, &scope, capture, &who, files, budget))
        else {
            return;
        };
        if from_panic && self.config.data_dir.is_none() {
            let _ = deliver_crash(self.transport.as_ref(), &self.context(), &pending);
            return;
        }
        self.store.save_crash(&pending);
        self.send(Msg::Crash(Box::new(pending)));
    }

    fn scope_without_blocking(&self) -> Scope {
        match self.scope.try_lock() {
            Ok(scope) => scope.clone(),
            Err(TryLockError::Poisoned(p)) => p.into_inner().clone(),
            // Held by the panicking thread itself or another one: report without it.
            Err(TryLockError::WouldBlock) => Scope::new(0),
        }
    }

    fn before_send(&self, mut pending: PendingCrash) -> Option<PendingCrash> {
        if let Some(hook) = &self.config.before_send {
            let crash = hook(pending.crash)?;
            pending
                .files
                .retain(|(id, _)| crash.attachments.iter().any(|a| &a.id == id));
            pending.crash = crash;
        }
        Some(pending)
    }
}
