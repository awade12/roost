use crate::crash::Attachment;
use crate::model::{Crash, Platform};
use crate::transport::Transport;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

pub type BeforeSend = Arc<dyn Fn(Crash) -> Option<Crash> + Send + Sync>;
pub type AttachmentsFn = Arc<dyn Fn() -> Vec<Attachment> + Send + Sync>;

/// How the SDK is set up. `Config::new(endpoint, client_key, player_id, build)` plus builder calls.
#[derive(Clone)]
pub struct Config {
    pub(crate) endpoint: String,
    pub(crate) client_key: String,
    pub(crate) player_id: String,
    pub(crate) build: String,
    pub(crate) platform: Platform,
    pub(crate) os_version: Option<String>,
    pub(crate) device_model: Option<String>,
    pub(crate) locale: Option<String>,
    pub(crate) data_dir: Option<PathBuf>,
    pub(crate) flush_interval: Duration,
    pub(crate) timeout: Duration,
    pub(crate) capture_panics: bool,
    pub(crate) max_breadcrumbs: usize,
    pub(crate) in_app: Vec<String>,
    pub(crate) before_send: Option<BeforeSend>,
    pub(crate) attachments: Option<AttachmentsFn>,
    pub(crate) transport: Option<Arc<dyn Transport>>,
}

impl Config {
    /// `endpoint` like `https://roost.example.com`; `client_key` is the game environment's
    /// `rk_client_…` key (safe to ship); `build` is the game version, e.g. `1.4.2+881`.
    pub fn new(
        endpoint: impl Into<String>,
        client_key: impl Into<String>,
        player_id: impl Into<String>,
        build: impl Into<String>,
    ) -> Self {
        Self {
            endpoint: endpoint.into(),
            client_key: client_key.into(),
            player_id: player_id.into(),
            build: build.into(),
            platform: Platform::current(),
            os_version: None,
            device_model: None,
            locale: None,
            data_dir: None,
            flush_interval: Duration::from_secs(10),
            timeout: Duration::from_secs(10),
            capture_panics: true,
            max_breadcrumbs: 50,
            in_app: Vec::new(),
            before_send: None,
            attachments: None,
            transport: None,
        }
    }

    /// Where queued events and unsent reports are kept between launches, e.g. the game's
    /// save folder. Strongly recommended: without it a panic that kills the game is lost.
    pub fn data_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.data_dir = Some(dir.into());
        self
    }

    pub fn platform(mut self, platform: Platform) -> Self {
        self.platform = platform;
        self
    }

    pub fn os_version(mut self, v: impl Into<String>) -> Self {
        self.os_version = Some(v.into());
        self
    }

    pub fn device_model(mut self, v: impl Into<String>) -> Self {
        self.device_model = Some(v.into());
        self
    }

    pub fn locale(mut self, v: impl Into<String>) -> Self {
        self.locale = Some(v.into());
        self
    }

    /// How often queued events are sent. Default 10 s.
    pub fn flush_interval(mut self, every: Duration) -> Self {
        self.flush_interval = every.max(Duration::from_millis(100));
        self
    }

    /// Per-request timeout. Default 10 s.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Report panics automatically. Default true.
    pub fn capture_panics(mut self, on: bool) -> Self {
        self.capture_panics = on;
        self
    }

    /// Recent events/breadcrumbs kept for reports. Default 50, max 100.
    pub fn max_breadcrumbs(mut self, n: usize) -> Self {
        self.max_breadcrumbs = n;
        self
    }

    /// A crate path prefix that is the game's own code, e.g. `"my_game::"`. Call once per crate.
    /// Issues group on these frames. Without any, everything outside std and this SDK counts.
    pub fn in_app(mut self, prefix: impl Into<String>) -> Self {
        self.in_app.push(prefix.into());
        self
    }

    /// Last chance to edit a report (scrub, add fields) or drop it by returning `None`.
    /// Runs inside the panic hook for panics, so it must not panic itself.
    pub fn before_send(
        mut self,
        f: impl Fn(Crash) -> Option<Crash> + Send + Sync + 'static,
    ) -> Self {
        self.before_send = Some(Arc::new(f));
        self
    }

    /// Files gathered for every report at capture time, e.g. the current save.
    /// Up to 5 files, 10 MB each; panics keep 2 MB in total. Must not panic.
    pub fn attachments(mut self, f: impl Fn() -> Vec<Attachment> + Send + Sync + 'static) -> Self {
        self.attachments = Some(Arc::new(f));
        self
    }

    /// Send through your own HTTP stack (or a fake in tests) instead of the built-in client.
    pub fn transport(mut self, transport: Arc<dyn Transport>) -> Self {
        self.transport = Some(transport);
        self
    }
}
