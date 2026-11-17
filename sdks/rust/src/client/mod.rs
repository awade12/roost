mod ai;
mod calls;
mod config;
mod shared;
mod worker;

pub use ai::{AiOptions, AiResponse, AiTurn, AiUsage};
pub use calls::{PlayerReport, ReportCategory};
pub use config::{AttachmentsFn, BeforeSend, Config};

use crate::crash::{self, Attachment, Capture, Raw, Scope, to_object};
use crate::error::RoostError;
use crate::model::{Breadcrumb, Kind, TrackEvent, new_id, truncate};
use crate::transport::{HttpTransport, Queue, Store, Transport};
use serde::Serialize;
use shared::{Shared, lock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use worker::Msg;

/// The Roost client. Start one at launch and share it (`Arc<Roost>` or a `static OnceLock`).
/// Every method is cheap and never blocks on the network, except `flush`, `shutdown` and `ai`.
/// Nothing here panics or returns errors the game must handle, except `start` and `ai`.
pub struct Roost {
    shared: Arc<Shared>,
    worker: Mutex<Option<JoinHandle<()>>>,
    #[cfg(feature = "native-crashes")]
    native: Mutex<Option<crate::native::Guard>>,
}

impl Roost {
    /// Loads anything left from the last run (events, unsent crash reports), starts the
    /// background sender, and installs the panic hook unless `capture_panics(false)`.
    pub fn start(config: Config) -> Result<Self, RoostError> {
        validate(&config)?;
        let store = Store::new(config.data_dir.as_deref());
        let transport: Arc<dyn Transport> = match &config.transport {
            Some(t) => Arc::clone(t),
            None => Arc::new(HttpTransport::new(
                &config.endpoint,
                &config.client_key,
                config.timeout,
            )),
        };
        let (tx, rx) = mpsc::channel();
        let pending = store.load_crashes();
        let shared = Arc::new(Shared {
            session_id: new_id(),
            queue: Mutex::new(Queue::from_vec(store.load_events())),
            scope: Mutex::new(Scope::new(config.max_breadcrumbs)),
            store,
            transport,
            tx,
            active: AtomicBool::new(true),
            flags: crate::flags::Flags::new(config.data_dir.as_deref()),
            config,
        });
        let handle = worker::spawn(Arc::clone(&shared), rx, pending)
            .map_err(|e| RoostError::Config(format!("could not start sender thread: {e}")))?;
        if shared.config.capture_panics {
            let hooked = Arc::clone(&shared);
            crash::install(move |info| {
                if hooked.active.load(Ordering::Acquire) {
                    let raw = crash::describe(info, &hooked.config.in_app);
                    let capture = Capture::new()
                        .tag("thread", std::thread::current().name().unwrap_or("unnamed"));
                    hooked.capture(raw, capture, true);
                }
            });
        }
        let roost = Self {
            #[cfg(feature = "native-crashes")]
            native: Mutex::new(attach_native(&shared)),
            shared,
            worker: Mutex::new(Some(handle)),
        };
        roost.track("session_start");
        // Sends crash reports saved by the last run straight away.
        roost.shared.send(Msg::Flush(None));
        Ok(roost)
    }

    pub fn session_id(&self) -> &str {
        &self.shared.session_id
    }

    /// Queues an analytics event. Names must be snake_case; invalid ones are dropped.
    pub fn track(&self, name: &str) {
        self.shared.track(TrackEvent::new(name));
    }

    /// `roost.track_event(TrackEvent::new("level_complete").prop("level", 3).value(42.0))`.
    pub fn track_event(&self, event: TrackEvent) {
        self.shared.track(event);
    }

    /// Reports a caught error with its `source()` chain and the current stack.
    pub fn capture_error<E: std::error::Error + ?Sized>(&self, error: &E, capture: Capture) {
        let (stack, frames) = crash::describe_error(&error, &self.shared.config.in_app);
        let error_type = crash::short_type_name(std::any::type_name::<E>());
        let raw = Raw {
            kind: Kind::Error,
            error_type,
            message: error.to_string(),
            stack,
            frames: Some(frames),
        };
        self.shared.capture(raw, capture, false);
    }

    /// Reports something that isn't an error, e.g. "Save migration fell back to defaults". Level info by default.
    pub fn capture_message(&self, message: impl Into<String>, capture: Capture) {
        let raw = Raw {
            kind: Kind::Message,
            error_type: "Message".to_owned(),
            message: message.into(),
            stack: String::new(),
            frames: None,
        };
        self.shared.capture(raw, capture, false);
    }

    /// Tags every later report. Searchable, and broken down on the issue page.
    pub fn set_tag(&self, key: impl Into<String>, value: impl ToString) {
        lock(&self.shared.scope)
            .tags
            .insert(key.into(), value.to_string());
    }

    pub fn remove_tag(&self, key: &str) {
        lock(&self.shared.scope).tags.remove(key);
    }

    /// A named block of structured data on every later report; anything `Serialize`.
    pub fn set_context(&self, name: impl Into<String>, data: impl Serialize) {
        let name = name.into();
        let mut scope = lock(&self.shared.scope);
        match to_object(data) {
            Some(map) => scope.contexts.insert(name, map),
            None => scope.contexts.remove(&name),
        };
    }

    pub fn remove_context(&self, name: &str) {
        lock(&self.shared.scope).contexts.remove(name);
    }

    /// Any JSON value on every later report. Keep it small; use attachments for files.
    pub fn set_extra(&self, key: impl Into<String>, value: impl Serialize) {
        if let Ok(value) = serde_json::to_value(value) {
            lock(&self.shared.scope).extra.insert(key.into(), value);
        }
    }

    pub fn add_breadcrumb(&self, crumb: Breadcrumb) {
        lock(&self.shared.scope).add_breadcrumb(crumb);
    }

    /// A file sent with every later report until replaced (same name) or removed.
    /// For data that changes often, prefer `Config::attachments`, which reads it at capture time.
    pub fn set_attachment(&self, attachment: Attachment) {
        let name = truncate(&attachment.name, 128);
        lock(&self.shared.scope)
            .attachments
            .insert(name, attachment);
    }

    pub fn remove_attachment(&self, name: &str) {
        lock(&self.shared.scope).attachments.remove(name);
    }

    /// Sends everything queued now and waits for it (up to the timeout). `true` if the sender answered.
    pub fn flush(&self) -> bool {
        let (done, wait) = mpsc::sync_channel(1);
        self.shared.send(Msg::Flush(Some(done)));
        wait.recv_timeout(self.shared.config.timeout * 2).is_ok()
    }

    /// Tracks `session_end`, sends what it can, saves the rest, and stops reporting panics.
    /// Called on drop too.
    /// A boolean flag from the dashboard, or `default` if it doesn't exist (yet) or isn't a boolean.
    pub fn flag_bool(&self, key: &str, default: bool) -> bool {
        self.shared
            .flags
            .get(key, "boolean")
            .and_then(|v| v.as_bool())
            .unwrap_or(default)
    }

    pub fn flag_str(&self, key: &str, default: &str) -> String {
        self.shared
            .flags
            .get(key, "string")
            .and_then(|v| v.as_str().map(str::to_owned))
            .unwrap_or_else(|| default.to_owned())
    }

    pub fn flag_f64(&self, key: &str, default: f64) -> f64 {
        self.shared
            .flags
            .get(key, "number")
            .and_then(|v| v.as_f64())
            .unwrap_or(default)
    }

    /// A JSON flag deserialized into your type, e.g. tuning values; `default` if missing or it doesn't fit.
    pub fn flag_json<T: serde::de::DeserializeOwned>(&self, key: &str, default: T) -> T {
        self.shared
            .flags
            .get(key, "json")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or(default)
    }

    /// The flag with its OpenFeature reason and variant, for logging or debugging targeting.
    pub fn flag_details(&self, key: &str) -> Option<crate::flags::ResolvedFlag> {
        self.shared.flags.details(key)
    }

    /// Fetches flags now and waits for the answer (up to the timeout). True if values changed.
    pub fn refresh_flags(&self) -> bool {
        let (done, wait) = mpsc::sync_channel(1);
        self.shared.send(Msg::RefreshFlags(done));
        wait.recv_timeout(self.shared.config.timeout * 2)
            .unwrap_or(false)
    }

    pub fn shutdown(&self) {
        if !self.shared.active.swap(false, Ordering::AcqRel) {
            return;
        }
        #[cfg(feature = "native-crashes")]
        lock(&self.native).take();
        self.track("session_end");
        let (done, wait) = mpsc::sync_channel(1);
        self.shared.send(Msg::Stop(done));
        if wait.recv_timeout(self.shared.config.timeout * 2).is_ok()
            && let Some(handle) = lock(&self.worker).take()
        {
            let _ = handle.join();
        }
    }
}

impl Drop for Roost {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// `None` when off, without a data dir, or when the monitor couldn't start.
#[cfg(feature = "native-crashes")]
fn attach_native(shared: &Arc<Shared>) -> Option<crate::native::Guard> {
    let config = &shared.config;
    if !config.native_crashes {
        return None;
    }
    let dir = config.data_dir.as_deref()?;
    // Weak: the snapshot thread must not keep the client alive after the game drops it.
    let weak = Arc::downgrade(shared);
    crate::native::attach(dir, move || weak.upgrade()?.native_snapshot())
}

fn validate(config: &Config) -> Result<(), RoostError> {
    let bad = |what: &str| Err(RoostError::Config(what.to_owned()));
    if !(config.endpoint.starts_with("https://") || config.endpoint.starts_with("http://")) {
        return bad("endpoint must start with https:// or http://");
    }
    if config.client_key.is_empty() {
        return bad("client_key is required");
    }
    if !(1..=64).contains(&config.player_id.chars().count()) {
        return bad("player_id must be 1-64 characters");
    }
    if !(1..=64).contains(&config.build.chars().count()) {
        return bad("build must be 1-64 characters");
    }
    Ok(())
}
