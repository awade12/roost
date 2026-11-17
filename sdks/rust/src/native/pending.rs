//! Dumps waiting on disk under `<data_dir>/roost/minidumps`: listing, pruning, and sending
//! them on the next launch with their scope and the game's files.

use super::snapshot::{DumpInfo, Snapshot, post_body};
use crate::crash::{Attachment, pick_files};
use crate::model::{AttachmentRef, now_rfc3339, rfc3339};
use crate::transport::{Outcome, Transport, outcome};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// Cap on dumps kept on disk, so a crash loop can't fill the player's drive.
pub(crate) const MAX_PENDING_DUMPS: usize = 10;

/// `<data_dir>/roost/minidumps`.
pub(crate) fn dump_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("roost").join("minidumps")
}

/// Finished dumps (`*.dmp`), oldest first. Dumps still being written end in `.partial`.
pub(crate) fn list_dumps(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dumps: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "dmp"))
        .map(|p| (modified(&p).unwrap_or(SystemTime::UNIX_EPOCH), p))
        .collect();
    dumps.sort();
    dumps.into_iter().map(|(_, p)| p).collect()
}

pub(crate) fn modified(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).and_then(|m| m.modified()).ok()
}

pub(crate) fn sidecar(dump: &Path) -> PathBuf {
    dump.with_extension("json")
}

/// Deletes a dump and its sidecar. Missing files are fine.
pub(crate) fn remove(dump: &Path) {
    let _ = fs::remove_file(dump);
    let _ = fs::remove_file(sidecar(dump));
}

/// Deletes the oldest dumps until at most `keep` remain.
pub(crate) fn prune(dir: &Path, keep: usize) {
    let dumps = list_dumps(dir);
    let extra = dumps.len().saturating_sub(keep);
    for dump in dumps.iter().take(extra) {
        remove(dump);
    }
}

/// Sidecars whose dump never made it (the monitor failed mid-write) and stale partial dumps.
/// Only old ones: a monitor may be writing a fresh pair right now.
pub(crate) fn remove_orphans(dir: &Path) {
    let stale = |p: &Path| {
        modified(p)
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age > Duration::from_secs(300))
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for path in entries.flatten().map(|e| e.path()) {
        let orphan_json =
            path.extension().is_some_and(|e| e == "json") && !path.with_extension("dmp").exists();
        let partial = path.extension().is_some_and(|e| e == "partial");
        if (orphan_json || partial) && stale(&path) {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Contract limit (`MAX_MINIDUMP_BYTES`): bigger dumps are rejected, so they are dropped.
pub(crate) const MAX_DUMP_BYTES: u64 = 20 * 1024 * 1024;

/// Who and where, for dumps whose sidecar is missing.
pub(crate) struct Fallback<'a> {
    pub player_id: &'a str,
    pub context: serde_json::Value,
}

/// Sends every dump under `<data_dir>/roost/minidumps`, oldest first. A dump is deleted once
/// sent or rejected; on a network problem it and everything after it wait for the next launch.
/// `files` (`Config::attachments`) is only called if there is something to send.
pub(crate) fn upload_pending(
    transport: &dyn Transport,
    data_dir: &Path,
    fallback: &Fallback<'_>,
    files: impl FnOnce() -> Vec<Attachment>,
) {
    let dir = dump_dir(data_dir);
    remove_orphans(&dir);
    prune(&dir, MAX_PENDING_DUMPS);
    let dumps = list_dumps(&dir);
    if dumps.is_empty() {
        return;
    }
    let files = files();
    for dump in dumps {
        if deliver(transport, &dump, fallback, &files) == Outcome::Retry {
            return;
        }
        remove(&dump);
    }
}

/// a) POST the report, b) PUT the dump, c) PUT each file. `Sent` or `Rejected` both mean
/// "done with it"; only `Retry` keeps the dump.
fn deliver(
    transport: &dyn Transport,
    dump: &Path,
    fallback: &Fallback<'_>,
    files: &[Attachment],
) -> Outcome {
    let Some(id) = dump.file_stem().and_then(|s| s.to_str()) else {
        return Outcome::Rejected;
    };
    let size = fs::metadata(dump).map(|m| m.len()).unwrap_or(0);
    // Empty (the monitor died mid-write) or too big for the server: never sendable.
    if size == 0 || size > MAX_DUMP_BYTES {
        return Outcome::Rejected;
    }
    let Ok(bytes) = fs::read(dump) else {
        return Outcome::Retry;
    };
    let snapshot: Snapshot = fs::read(sidecar(dump))
        .ok()
        .and_then(|json| serde_json::from_slice(&json).ok())
        .unwrap_or_default();
    let (refs, file_bytes) = pick_files(files.iter().cloned(), usize::MAX);
    let info = DumpInfo {
        id,
        ts: modified(dump).map_or_else(now_rfc3339, rfc3339),
        dump_size: size,
        player_id: fallback.player_id,
        context: &fallback.context,
    };
    let body = post_body(snapshot, &info, &refs).to_string();
    let posted = outcome(&transport.post_json("/v1/minidumps", &body));
    if posted != Outcome::Sent {
        return posted;
    }
    let path = format!("/v1/minidumps/{id}/dump");
    let put =
        outcome(&transport.put_bytes(&path, "minidump.dmp", "application/x-minidump", &bytes));
    if put != Outcome::Sent {
        return put;
    }
    put_files(transport, id, &refs, &file_bytes)
}

/// Like crash attachments: a rejected file is skipped, a network problem retries the dump.
fn put_files(
    transport: &dyn Transport,
    id: &str,
    refs: &[AttachmentRef],
    files: &[(String, Vec<u8>)],
) -> Outcome {
    for (file_id, data) in files {
        let Some(meta) = refs.iter().find(|r| &r.id == file_id) else {
            continue;
        };
        let path = format!("/v1/crashes/{id}/attachments/{file_id}");
        if outcome(&transport.put_bytes(&path, &meta.name, &meta.content_type, data))
            == Outcome::Retry
        {
            return Outcome::Retry;
        }
    }
    Outcome::Sent
}
