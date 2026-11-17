use crate::crash::{MAX_BREADCRUMBS, clean_tags, limit_contexts, limit_extra};
use crate::model::{AttachmentRef, Breadcrumb, JsonMap};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// IPC message kinds for a snapshot. Big messages over a stream socket can arrive split
/// (macOS buffers are 8 KB), so a snapshot goes as a reset, small chunks, then a commit.
pub(crate) const MSG_RESET: u32 = 1;
pub(crate) const MSG_CHUNK: u32 = 2;
pub(crate) const MSG_COMMIT: u32 = 3;
pub(crate) const CHUNK_BYTES: usize = 2048;

/// Snapshots past this are trimmed (fewer breadcrumbs, no extra) before sending.
const MAX_SNAPSHOT_BYTES: usize = 128 * 1024;

/// The scope at crash time, kept by the monitor as `<uuid>.json` next to the dump.
/// `context` is the `DeviceContext` JSON as sent with events (build, platform…).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Snapshot {
    pub context: Option<serde_json::Value>,
    pub session_id: Option<String>,
    pub player_id: Option<String>,
    pub tags: BTreeMap<String, String>,
    pub contexts: BTreeMap<String, JsonMap>,
    pub extra: JsonMap,
    pub breadcrumbs: Vec<Breadcrumb>,
}

impl Snapshot {
    /// JSON for the monitor, trimmed so a huge scope can't stall the IPC channel.
    pub(crate) fn to_bytes(&self) -> Option<Vec<u8>> {
        let bytes = serde_json::to_vec(self).ok()?;
        if bytes.len() <= MAX_SNAPSHOT_BYTES {
            return Some(bytes);
        }
        let mut small = self.clone();
        let skip = small.breadcrumbs.len().saturating_sub(20);
        small.breadcrumbs.drain(..skip);
        small.extra = JsonMap::new();
        let bytes = serde_json::to_vec(&small).ok()?;
        (bytes.len() <= MAX_SNAPSHOT_BYTES).then_some(bytes)
    }
}

/// What the uploader knows about one dump besides the sidecar.
pub(crate) struct DumpInfo<'a> {
    pub id: &'a str,
    pub ts: String,
    pub dump_size: u64,
    /// Used when the sidecar is missing or has no player id.
    pub player_id: &'a str,
    /// Used when the sidecar is missing its context (e.g. the monitor never got a snapshot).
    pub context: &'a serde_json::Value,
}

/// The `POST /v1/minidumps` body. Limits match crash reports, so the server never
/// rejects a dump for an oversized scope.
pub(crate) fn post_body(
    snapshot: Snapshot,
    info: &DumpInfo<'_>,
    attachments: &[AttachmentRef],
) -> serde_json::Value {
    let context = snapshot.context.unwrap_or_else(|| info.context.clone());
    let player_id = snapshot
        .player_id
        .filter(|p| (1..=64).contains(&p.chars().count()))
        .unwrap_or_else(|| info.player_id.to_owned());
    let mut breadcrumbs = snapshot.breadcrumbs;
    let skip = breadcrumbs.len().saturating_sub(MAX_BREADCRUMBS);
    breadcrumbs.drain(..skip);
    let mut report = serde_json::json!({
        "id": info.id,
        "ts": info.ts,
        "playerId": player_id,
        "tags": clean_tags(snapshot.tags),
        "contexts": limit_contexts(snapshot.contexts),
        "extra": limit_extra(snapshot.extra),
        "breadcrumbs": breadcrumbs,
        "attachments": attachments,
        "dumpSize": info.dump_size,
    });
    // Optional in the contract, and it must not be empty when present.
    if let Some(session) = snapshot
        .session_id
        .filter(|s| (1..=64).contains(&s.chars().count()))
    {
        report["sessionId"] = serde_json::Value::String(session);
    }
    serde_json::json!({ "context": context, "report": report })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info<'a>(context: &'a serde_json::Value) -> DumpInfo<'a> {
        DumpInfo {
            id: "6f1c0a52-3c1e-4e8e-9a59-8f8f0d1b2c3d",
            ts: "2026-11-16T10:00:00.000Z".to_owned(),
            dump_size: 4096,
            player_id: "player-now",
            context,
        }
    }

    #[test]
    fn builds_the_post_body_from_a_sidecar() {
        let sidecar = r#"{
            "context": { "build": "1.4.2", "platform": "macos", "sdk": "rust/0.2.0" },
            "sessionId": "sess-1", "playerId": "player-then",
            "tags": { "level": "forest-3", "bad key!": "x" },
            "contexts": { "match": { "round": 3 } },
            "extra": { "saveVersion": 7 },
            "breadcrumbs": [{ "name": "save_loaded", "ts": "2026-11-16T09:59:00.000Z" }]
        }"#;
        let snapshot: Snapshot = serde_json::from_str(sidecar).unwrap_or_default();
        let fallback = serde_json::json!({ "build": "9.9.9" });
        let refs = [AttachmentRef {
            id: "a1".into(),
            name: "save.json".into(),
            content_type: "application/json".into(),
            size: 2,
        }];
        let body = post_body(snapshot, &info(&fallback), &refs);
        assert_eq!(body["context"]["build"], "1.4.2");
        let r = &body["report"];
        assert_eq!(r["id"], "6f1c0a52-3c1e-4e8e-9a59-8f8f0d1b2c3d");
        assert_eq!(r["ts"], "2026-11-16T10:00:00.000Z");
        assert_eq!(r["playerId"], "player-then");
        assert_eq!(r["sessionId"], "sess-1");
        assert_eq!(r["tags"]["level"], "forest-3");
        assert!(r["tags"].get("bad key!").is_none());
        assert_eq!(r["contexts"]["match"]["round"], 3);
        assert_eq!(r["extra"]["saveVersion"], 7);
        assert_eq!(r["breadcrumbs"][0]["name"], "save_loaded");
        assert_eq!(r["attachments"][0]["name"], "save.json");
        assert_eq!(r["dumpSize"], 4096);
    }

    #[test]
    fn falls_back_without_a_sidecar() {
        let fallback = serde_json::json!({ "build": "9.9.9" });
        let body = post_body(Snapshot::default(), &info(&fallback), &[]);
        assert_eq!(body["context"]["build"], "9.9.9");
        assert_eq!(body["report"]["playerId"], "player-now");
        assert!(body["report"].get("sessionId").is_none());
        assert_eq!(body["report"]["breadcrumbs"], serde_json::json!([]));
    }

    #[test]
    fn trims_oversized_snapshots() {
        let snapshot = Snapshot {
            extra: JsonMap::from_iter([("big".to_owned(), "x".repeat(200_000).into())]),
            breadcrumbs: (0..50).map(|i| Breadcrumb::new(format!("b{i}"))).collect(),
            ..Snapshot::default()
        };
        let bytes = snapshot.to_bytes().unwrap_or_default();
        let back: Snapshot = serde_json::from_slice(&bytes).unwrap_or_default();
        assert!(back.extra.is_empty());
        assert_eq!(back.breadcrumbs.len(), 20);
        assert_eq!(back.breadcrumbs[0].name, "b30");
    }
}
