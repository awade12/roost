use super::event::{Props, flat_value, truncate};
use super::time::now_rfc3339;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// JSON object, used for contexts and extra data.
pub type JsonMap = serde_json::Map<String, serde_json::Value>;

/// How bad a report is. Defaults from the kind: panics are fatal, errors are errors, messages are info.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Fatal,
    Error,
    Warning,
    Info,
}

/// `Crash` ended the game (a panic), `Error` was caught and reported, `Message` has no exception.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Crash,
    Error,
    Message,
}

/// One stack frame, innermost first.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column: Option<u32>,
    /// The game's own code, not std or a library. Issues are grouped by these frames.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub in_app: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BreadcrumbLevel {
    Debug,
    Info,
    Warning,
    Error,
}

/// Something that happened before a report, shown as a timeline on the issue page.
/// `Breadcrumb::new("save_loaded").category("save").message("slot 2")`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Breadcrumb {
    pub name: String,
    pub ts: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub props: Option<Props>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<BreadcrumbLevel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl Breadcrumb {
    /// Timestamped now.
    pub fn new(name: impl Into<String>) -> Self {
        let name = truncate(&name.into(), 64);
        Self {
            name,
            ts: now_rfc3339(),
            props: None,
            category: None,
            level: None,
            message: None,
        }
    }

    /// What kind of thing happened: "ui", "network", "save"…
    pub fn category(mut self, category: impl Into<String>) -> Self {
        self.category = Some(truncate(&category.into(), 32));
        self
    }

    pub fn level(mut self, level: BreadcrumbLevel) -> Self {
        self.level = Some(level);
        self
    }

    pub fn message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(truncate(&message.into(), 512));
        self
    }

    pub fn prop(mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) -> Self {
        let key = truncate(&key.into(), 64);
        self.props
            .get_or_insert_with(Props::new)
            .insert(key, flat_value(value.into(), 256));
        self
    }
}

/// A file declared on a report. The bytes are uploaded separately.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRef {
    pub id: String,
    pub name: String,
    pub content_type: String,
    pub size: u64,
}

/// A crash or error report as sent to `/v1/crashes`. Mirrors `CrashSchema` in `packages/contracts`.
/// `before_send` gets this to edit; keep within the documented limits or the server rejects it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Crash {
    pub id: String,
    pub kind: Kind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<Level>,
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
    pub stack: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frames: Option<Vec<Frame>>,
    pub ts: String,
    pub session_id: String,
    pub player_id: String,
    pub breadcrumbs: Vec<Breadcrumb>,
    pub tags: BTreeMap<String, String>,
    pub contexts: BTreeMap<String, JsonMap>,
    pub extra: JsonMap,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<Vec<String>>,
    pub attachments: Vec<AttachmentRef>,
}
