use super::scope::Scope;
use crate::model::{
    AttachmentRef, Crash, Frame, JsonMap, Kind, Level, new_id, now_rfc3339, truncate,
};
use crate::transport::PendingCrash;
use serde::Serialize;
use std::collections::BTreeMap;

/// Contract limits (`packages/contracts/src/crashes.ts`). Over these the server rejects the report.
pub const MAX_ATTACHMENTS: usize = 5;
pub const MAX_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;
/// Panics write their files to disk before the game dies, so they get a smaller budget.
pub const PANIC_ATTACHMENT_BUDGET: usize = 2 * 1024 * 1024;
const MAX_TAGS: usize = 50;
const MAX_CONTEXTS_JSON: usize = 32_000;
const MAX_EXTRA_JSON: usize = 64_000;

/// A file sent with a report, e.g. the player's save. Downloaded from the issue page.
#[derive(Debug, Clone)]
pub struct Attachment {
    pub name: String,
    pub content_type: String,
    pub data: Vec<u8>,
}

impl Attachment {
    /// The content type is guessed from the extension (`.json`, `.txt`, `.log`, `.png`…).
    pub fn new(name: impl Into<String>, data: impl Into<Vec<u8>>) -> Self {
        let name = name.into();
        let content_type = guess_content_type(&name).to_owned();
        Self {
            name,
            content_type,
            data: data.into(),
        }
    }

    pub fn content_type(mut self, content_type: impl Into<String>) -> Self {
        self.content_type = content_type.into();
        self
    }
}

fn guess_content_type(name: &str) -> &'static str {
    let ext = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "json" => "application/json",
        "txt" | "log" => "text/plain",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "application/octet-stream",
    }
}

/// Per-report options for `capture_error` / `capture_message`. These merge over the scope
/// (`set_tag`, `set_context`…) and win on conflicts.
#[derive(Debug, Clone, Default)]
pub struct Capture {
    pub(crate) level: Option<Level>,
    pub(crate) error_type: Option<String>,
    pub(crate) tags: BTreeMap<String, String>,
    pub(crate) contexts: BTreeMap<String, JsonMap>,
    pub(crate) extra: JsonMap,
    pub(crate) fingerprint: Option<Vec<String>>,
    pub(crate) attachments: Vec<Attachment>,
}

impl Capture {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn level(mut self, level: Level) -> Self {
        self.level = Some(level);
        self
    }

    /// The type shown on the issue, e.g. "SaveCorrupt". Defaults to the error's Rust type name.
    pub fn error_type(mut self, name: impl Into<String>) -> Self {
        self.error_type = Some(name.into());
        self
    }

    pub fn tag(mut self, key: impl Into<String>, value: impl ToString) -> Self {
        self.tags.insert(key.into(), value.to_string());
        self
    }

    /// A named block of structured data; anything `Serialize` (non-objects go under `value`).
    pub fn context(mut self, name: impl Into<String>, data: impl Serialize) -> Self {
        if let Some(map) = to_object(data) {
            self.contexts.insert(name.into(), map);
        }
        self
    }

    pub fn extra(mut self, key: impl Into<String>, value: impl Serialize) -> Self {
        if let Ok(value) = serde_json::to_value(value) {
            self.extra.insert(key.into(), value);
        }
        self
    }

    /// Reports with the same fingerprint become one issue, whatever their stack.
    pub fn fingerprint<S: Into<String>>(mut self, parts: impl IntoIterator<Item = S>) -> Self {
        self.fingerprint = Some(parts.into_iter().map(Into::into).collect());
        self
    }

    pub fn attachment(mut self, attachment: Attachment) -> Self {
        self.attachments.push(attachment);
        self
    }
}

/// Serializes to a JSON object; `null` is nothing, other values are wrapped as `{ "value": … }`.
pub(crate) fn to_object(data: impl Serialize) -> Option<JsonMap> {
    match serde_json::to_value(data).ok()? {
        serde_json::Value::Object(map) => Some(map),
        serde_json::Value::Null => None,
        other => Some(JsonMap::from_iter([("value".to_owned(), other)])),
    }
}

/// The parts of a report that come from the error itself.
pub(crate) struct Raw {
    pub kind: Kind,
    pub error_type: String,
    pub message: String,
    pub stack: String,
    pub frames: Option<Vec<Frame>>,
}

pub(crate) struct Who<'a> {
    pub session_id: &'a str,
    pub player_id: &'a str,
}

/// Merges scope + options into a report that passes the contract, trimming instead of failing.
pub(crate) fn build(
    raw: Raw,
    scope: &Scope,
    capture: Capture,
    who: &Who<'_>,
    files: Vec<Attachment>,
    budget: usize,
) -> PendingCrash {
    let level = capture.level.unwrap_or(match raw.kind {
        Kind::Crash => Level::Fatal,
        Kind::Error => Level::Error,
        Kind::Message => Level::Info,
    });
    let mut tags = scope.tags.clone();
    tags.extend(capture.tags);
    let mut contexts = scope.contexts.clone();
    contexts.extend(capture.contexts);
    let mut extra = scope.extra.clone();
    extra.extend(capture.extra);
    let all_files = scope
        .attachments
        .values()
        .cloned()
        .chain(files)
        .chain(capture.attachments);
    let (attachments, bytes) = pick_files(all_files, budget);
    let error_type = truncate(
        capture.error_type.as_deref().unwrap_or(&raw.error_type),
        128,
    );
    let crash = Crash {
        id: new_id(),
        kind: raw.kind,
        level: Some(level),
        error_type: if error_type.is_empty() {
            "Error".to_owned()
        } else {
            error_type
        },
        message: truncate(&raw.message, 2000),
        stack: truncate(&raw.stack, 32_000),
        frames: raw.frames.filter(|f| !f.is_empty()),
        ts: now_rfc3339(),
        session_id: who.session_id.to_owned(),
        player_id: who.player_id.to_owned(),
        breadcrumbs: scope.breadcrumbs(),
        tags: clean_tags(tags),
        contexts: limit_contexts(contexts),
        extra: limit_extra(extra),
        fingerprint: capture
            .fingerprint
            .map(|f| f.iter().take(5).map(|p| truncate(p, 128)).collect())
            .filter(|f: &Vec<String>| !f.is_empty()),
        attachments,
    };
    PendingCrash {
        crash,
        files: bytes,
    }
}

type Files = (Vec<AttachmentRef>, Vec<(String, Vec<u8>)>);

fn pick_files(files: impl Iterator<Item = Attachment>, budget: usize) -> Files {
    let (mut refs, mut bytes, mut used) = (Vec::new(), Vec::new(), 0usize);
    for file in files
        .filter(|f| f.data.len() <= MAX_ATTACHMENT_BYTES)
        .take(MAX_ATTACHMENTS)
    {
        if used + file.data.len() > budget {
            continue;
        }
        used += file.data.len();
        let id = new_id();
        let name = truncate(&file.name, 128);
        refs.push(AttachmentRef {
            id: id.clone(),
            name: if name.is_empty() {
                "attachment".to_owned()
            } else {
                name
            },
            content_type: truncate(&file.content_type, 128),
            size: u64::try_from(file.data.len()).unwrap_or(u64::MAX),
        });
        bytes.push((id, file.data));
    }
    (refs, bytes)
}

fn clean_tags(tags: BTreeMap<String, String>) -> BTreeMap<String, String> {
    let valid_key = |k: &str| {
        (1..=32).contains(&k.len())
            && k.chars()
                .all(|c| c.is_ascii_alphanumeric() || "_.:-".contains(c))
    };
    tags.into_iter()
        .filter(|(k, _)| valid_key(k))
        .take(MAX_TAGS)
        .map(|(k, v)| (k, truncate(&v, 200)))
        .collect()
}

fn short_keys(map: JsonMap) -> JsonMap {
    map.into_iter()
        .filter(|(k, _)| k.chars().count() <= 64)
        .collect()
}

fn json_len(value: &impl Serialize) -> usize {
    serde_json::to_vec(value)
        .map(|v| v.len())
        .unwrap_or(usize::MAX)
}

/// Over the size limit, the block is replaced with a note rather than rejecting the whole report.
fn limit_contexts(contexts: BTreeMap<String, JsonMap>) -> BTreeMap<String, JsonMap> {
    let contexts: BTreeMap<_, _> = contexts
        .into_iter()
        .filter(|(k, _)| k.chars().count() <= 32)
        .map(|(k, v)| (k, short_keys(v)))
        .collect();
    if json_len(&contexts) <= MAX_CONTEXTS_JSON {
        return contexts;
    }
    BTreeMap::from([(
        "roost".to_owned(),
        truncated_note("contexts over 32 KB were dropped"),
    )])
}

fn limit_extra(extra: JsonMap) -> JsonMap {
    let extra = short_keys(extra);
    if json_len(&extra) <= MAX_EXTRA_JSON {
        extra
    } else {
        truncated_note("extra over 64 KB was dropped; use an attachment")
    }
}

fn truncated_note(note: &str) -> JsonMap {
    JsonMap::from_iter([(
        "truncated".to_owned(),
        serde_json::Value::String(note.to_owned()),
    )])
}
