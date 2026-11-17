use super::Roost;
use super::shared::lock;
use crate::crash::{Attachment, clean_tags, limit_contexts, limit_extra, pick_files};
use crate::error::RoostError;
use crate::model::{JsonMap, new_id, now_rfc3339, truncate};
use crate::transport::Reply;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Deserialize)]
struct ErrorDetail {
    code: String,
    message: String,
}
use std::collections::BTreeMap;

/// `{ "error": { "code", "message" } }` from the API, or a generic one if the body isn't that.
pub(super) fn api_error(reply: &Reply) -> RoostError {
    let (code, message) = match serde_json::from_str::<ErrorBody>(&reply.body) {
        Ok(b) => (b.error.code, b.error.message),
        Err(_) => ("internal".to_owned(), format!("HTTP {}", reply.status)),
    };
    RoostError::Api {
        status: reply.status,
        code,
        message,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ReportCategory {
    Bug,
    Feedback,
    Crash,
    Other,
}

/// A bug report a player wrote in the game:
/// `PlayerReport::new("Can't jump on the bridge").attachment(Attachment::new("screenshot.png", png))`.
#[derive(Debug, Clone)]
pub struct PlayerReport {
    message: String,
    category: ReportCategory,
    email: Option<String>,
    attachments: Vec<Attachment>,
    include_config_attachments: bool,
    tags: BTreeMap<String, String>,
    extra: JsonMap,
}

impl PlayerReport {
    /// What the player wrote; up to 4000 characters are kept.
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            category: ReportCategory::Bug,
            email: None,
            attachments: Vec::new(),
            include_config_attachments: true,
            tags: BTreeMap::new(),
            extra: JsonMap::new(),
        }
    }

    pub fn category(mut self, category: ReportCategory) -> Self {
        self.category = category;
        self
    }

    /// Only if the player chose to share it, so the studio can reply.
    pub fn email(mut self, email: impl Into<String>) -> Self {
        self.email = Some(email.into());
        self
    }

    /// A screenshot, log or anything else. Up to 5 files, 10 MB each, with the config's files.
    pub fn attachment(mut self, attachment: Attachment) -> Self {
        self.attachments.push(attachment);
        self
    }

    /// Leave out `Config::attachments` (e.g. the save) for this report.
    pub fn without_config_attachments(mut self) -> Self {
        self.include_config_attachments = false;
        self
    }

    pub fn tag(mut self, key: impl Into<String>, value: impl ToString) -> Self {
        self.tags.insert(key.into(), value.to_string());
        self
    }

    pub fn extra(mut self, key: impl Into<String>, value: impl Serialize) -> Self {
        if let Ok(value) = serde_json::to_value(value) {
            self.extra.insert(key.into(), value);
        }
        self
    }
}

impl Roost {
    /// Sends a player's bug report with the current tags, contexts and breadcrumbs, then its
    /// files. **Blocks** until sent, so call it off the render thread; the player is waiting,
    /// so the game gets a result to show ("Thanks!" or "Couldn't send"). Returns the report id.
    pub fn report(&self, report: PlayerReport) -> Result<String, RoostError> {
        let shared = &self.shared;
        let scope = lock(&shared.scope).clone();
        let mut files: Vec<Attachment> = scope
            .attachments
            .values()
            .cloned()
            .chain(report.attachments)
            .collect();
        if report.include_config_attachments {
            files.extend(
                shared
                    .config
                    .attachments
                    .as_ref()
                    .map(|f| f())
                    .unwrap_or_default(),
            );
        }
        let (refs, bytes) = pick_files(files.into_iter(), usize::MAX);
        let mut tags = scope.tags.clone();
        tags.extend(report.tags);
        let mut extra = scope.extra.clone();
        extra.extend(report.extra);
        let id = new_id();
        let mut body = serde_json::json!({
            "context": shared.context(),
            "report": {
                "id": id,
                "ts": now_rfc3339(),
                "playerId": shared.config.player_id,
                "sessionId": shared.session_id,
                "category": report.category,
                "message": truncate(report.message.trim(), 4000),
                "tags": clean_tags(tags),
                "contexts": limit_contexts(scope.contexts.clone()),
                "extra": limit_extra(extra),
                "breadcrumbs": scope.breadcrumbs(),
                "attachments": refs,
            }
        });
        // Omitted rather than null: the API only accepts a real address here.
        if let Some(email) = report.email {
            body["report"]["email"] = serde_json::Value::String(email);
        }
        let reply = shared
            .transport
            .post_json("/v1/reports", &body.to_string())
            .map_err(RoostError::Network)?;
        if !(200..300).contains(&reply.status) {
            return Err(api_error(&reply));
        }
        for (file_id, data) in &bytes {
            let Some(meta) = refs.iter().find(|r| &r.id == file_id) else {
                continue;
            };
            let path = format!("/v1/reports/{id}/attachments/{file_id}");
            let put = shared
                .transport
                .put_bytes(&path, &meta.name, &meta.content_type, data)
                .map_err(RoostError::Network)?;
            if !(200..300).contains(&put.status) {
                return Err(api_error(&put));
            }
        }
        Ok(id)
    }
}
