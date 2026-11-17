//! Remote config and feature flags, resolved for this player by the server.
//! Reads never touch the network: they use the last values fetched (kept on disk between
//! launches when `data_dir` is set) or the caller's default.

use crate::transport::{Transport, percent_encode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

/// One flag as the server resolved it for this player (OpenFeature reason and variant).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedFlag {
    #[serde(rename = "type")]
    pub flag_type: String,
    pub value: serde_json::Value,
    pub variant: String,
    pub reason: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Snapshot {
    flags: HashMap<String, ResolvedFlag>,
    version: String,
}

#[derive(Debug, Default)]
pub(crate) struct Flags {
    state: Mutex<(Snapshot, Option<Instant>)>,
    path: Option<PathBuf>,
}

impl Flags {
    pub(crate) fn new(data_dir: Option<&std::path::Path>) -> Self {
        let path = data_dir.map(|d| d.join("roost").join("config.json"));
        let snapshot = path
            .as_ref()
            .and_then(|p| std::fs::read(p).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self {
            state: Mutex::new((snapshot, None)),
            path,
        }
    }

    fn lock(&self) -> MutexGuard<'_, (Snapshot, Option<Instant>)> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// True if never fetched this run, or the last fetch is older than `every`.
    pub(crate) fn due(&self, every: Duration) -> bool {
        self.lock().1.is_none_or(|at| at.elapsed() >= every)
    }

    /// GET /v1/config, sending the last version so an unchanged config is a tiny 304.
    /// Returns true if values changed. Never errors: offline keeps the old values.
    pub(crate) fn refresh(&self, transport: &dyn Transport, player_id: &str) -> bool {
        let version = self.lock().0.version.clone();
        let path = format!("/v1/config?playerId={}", percent_encode(player_id));
        let etag = (!version.is_empty()).then(|| format!("\"{version}\""));
        let reply = transport.get(&path, etag.as_deref());
        self.lock().1 = Some(Instant::now());
        let Ok(reply) = reply else { return false };
        if reply.status != 200 {
            return false;
        }
        let Ok(snapshot) = serde_json::from_str::<Snapshot>(&reply.body) else {
            return false;
        };
        if let Some(path) = &self.path {
            if let Some(dir) = path.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = std::fs::write(path, &reply.body);
        }
        self.lock().0 = snapshot;
        true
    }

    /// The flag if it exists and has the expected type.
    pub(crate) fn get(&self, key: &str, flag_type: &str) -> Option<serde_json::Value> {
        let state = self.lock();
        let flag = state.0.flags.get(key)?;
        (flag.flag_type == flag_type).then(|| flag.value.clone())
    }

    pub(crate) fn details(&self, key: &str) -> Option<ResolvedFlag> {
        self.lock().0.flags.get(key).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transport::Reply;

    struct Fake(u16, String);
    impl Transport for Fake {
        fn post_json(&self, _: &str, _: &str) -> Result<Reply, String> {
            Err("unused".into())
        }
        fn put_bytes(&self, _: &str, _: &str, _: &str, _: &[u8]) -> Result<Reply, String> {
            Err("unused".into())
        }
        fn get(&self, _: &str, _: Option<&str>) -> Result<Reply, String> {
            Ok(Reply {
                status: self.0,
                body: self.1.clone(),
            })
        }
    }

    const BODY: &str = r#"{"version":"v1","flags":{"new_shop":{"type":"boolean","value":true,"variant":"rollout","reason":"SPLIT"}}}"#;

    #[test]
    fn refreshes_and_reads_by_type() {
        let flags = Flags::new(None);
        assert!(flags.due(Duration::from_secs(300)));
        assert!(flags.refresh(&Fake(200, BODY.into()), "p1"));
        assert!(!flags.due(Duration::from_secs(300)));
        assert_eq!(
            flags.get("new_shop", "boolean"),
            Some(serde_json::json!(true))
        );
        assert_eq!(flags.get("new_shop", "string"), None);
        assert!(!flags.refresh(&Fake(304, String::new()), "p1"));
        assert_eq!(
            flags.get("new_shop", "boolean"),
            Some(serde_json::json!(true))
        );
    }
}
