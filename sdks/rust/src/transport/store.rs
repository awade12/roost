use crate::model::{Crash, Event};
use std::fs;
use std::path::{Path, PathBuf};

/// Cap on reports kept on disk, so a crash loop can't fill the player's drive.
pub(crate) const MAX_PENDING_CRASHES: usize = 20;

/// A report waiting to be sent, with the bytes of each attachment keyed by attachment id.
#[derive(Debug, Clone)]
pub(crate) struct PendingCrash {
    pub crash: Crash,
    pub files: Vec<(String, Vec<u8>)>,
}

/// Keeps queued events and unsent reports on disk between launches.
/// With no data dir everything stays in memory. Every failure is ignored: losing
/// telemetry is better than breaking the game.
///
/// Layout: `<dir>/roost/events.json`, `<dir>/roost/crashes/<id>/{report.json,<attachment-id>}`.
#[derive(Debug, Clone)]
pub(crate) struct Store {
    root: Option<PathBuf>,
}

impl Store {
    pub(crate) fn new(data_dir: Option<&Path>) -> Self {
        Self {
            root: data_dir.map(|d| d.join("roost")),
        }
    }

    pub(crate) fn save_events(&self, events: &[Event]) {
        let Some(root) = &self.root else { return };
        if let Ok(json) = serde_json::to_vec(events) {
            write_atomic(&root.join("events.json"), &json);
        }
    }

    pub(crate) fn load_events(&self) -> Vec<Event> {
        let Some(root) = &self.root else {
            return Vec::new();
        };
        fs::read(root.join("events.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    /// Files first, report last: a crash dir only counts once `report.json` exists.
    pub(crate) fn save_crash(&self, pending: &PendingCrash) {
        let Some(root) = &self.root else { return };
        let crashes = root.join("crashes");
        if count_dirs(&crashes) >= MAX_PENDING_CRASHES {
            return;
        }
        let dir = crashes.join(safe_name(&pending.crash.id));
        if fs::create_dir_all(&dir).is_err() {
            return;
        }
        for (id, bytes) in &pending.files {
            write_atomic(&dir.join(safe_name(id)), bytes);
        }
        if let Ok(json) = serde_json::to_vec(&pending.crash) {
            write_atomic(&dir.join("report.json"), &json);
        }
    }

    pub(crate) fn load_crashes(&self) -> Vec<PendingCrash> {
        let Some(root) = &self.root else {
            return Vec::new();
        };
        let Ok(entries) = fs::read_dir(root.join("crashes")) else {
            return Vec::new();
        };
        entries
            .flatten()
            .filter_map(|entry| load_crash(&entry.path()))
            .take(MAX_PENDING_CRASHES)
            .collect()
    }

    pub(crate) fn remove_crash(&self, id: &str) {
        let Some(root) = &self.root else { return };
        let _ = fs::remove_dir_all(root.join("crashes").join(safe_name(id)));
    }
}

fn load_crash(dir: &Path) -> Option<PendingCrash> {
    let crash: Crash = serde_json::from_slice(&fs::read(dir.join("report.json")).ok()?).ok()?;
    // A missing file is dropped from the report rather than blocking it forever.
    let files = crash
        .attachments
        .iter()
        .filter_map(|a| {
            fs::read(dir.join(safe_name(&a.id)))
                .ok()
                .map(|b| (a.id.clone(), b))
        })
        .collect::<Vec<_>>();
    let mut crash = crash;
    crash
        .attachments
        .retain(|a| files.iter().any(|(id, _)| id == &a.id));
    Some(PendingCrash { crash, files })
}

fn count_dirs(dir: &Path) -> usize {
    fs::read_dir(dir).map(|e| e.flatten().count()).unwrap_or(0)
}

/// Ids are UUIDs we generate, but `before_send` can change them; never let one escape the dir.
fn safe_name(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(64)
        .collect()
}

/// Write to a temp file then rename, so a crash mid-write never leaves half a file.
fn write_atomic(path: &Path, bytes: &[u8]) {
    let Some(parent) = path.parent() else { return };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let tmp = path.with_extension("tmp");
    if fs::write(&tmp, bytes).is_ok() {
        let _ = fs::rename(&tmp, path);
    }
}
