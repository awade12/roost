//! A fake API that records what the SDK sends.
#![allow(dead_code, clippy::unwrap_used)]

use roost_sdk::{Config, Reply, Transport};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub struct Put {
    pub path: String,
    pub filename: String,
    pub content_type: String,
    pub bytes: Vec<u8>,
}

pub struct Fake {
    pub posts: Mutex<Vec<(String, Value)>>,
    pub puts: Mutex<Vec<Put>>,
    pub status: AtomicU16,
    pub offline: AtomicBool,
    pub ai_body: Mutex<String>,
    /// Body for GET /v1/config; empty answers 304.
    pub config_body: Mutex<String>,
    pub gets: Mutex<Vec<(String, Option<String>)>>,
}

impl Fake {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            posts: Mutex::new(Vec::new()),
            puts: Mutex::new(Vec::new()),
            status: AtomicU16::new(202),
            offline: AtomicBool::new(false),
            ai_body: Mutex::new(String::new()),
            config_body: Mutex::new(String::new()),
            gets: Mutex::new(Vec::new()),
        })
    }

    pub fn set_status(&self, status: u16) {
        self.status.store(status, Ordering::SeqCst);
    }

    pub fn set_offline(&self, offline: bool) {
        self.offline.store(offline, Ordering::SeqCst);
    }

    /// Bodies POSTed to `path`.
    pub fn bodies(&self, path: &str) -> Vec<Value> {
        let posts = self.posts.lock().unwrap();
        posts
            .iter()
            .filter(|(p, _)| p == path)
            .map(|(_, b)| b.clone())
            .collect()
    }

    pub fn event_names(&self) -> Vec<String> {
        self.bodies("/v1/events")
            .iter()
            .flat_map(|b| b["events"].as_array().cloned().unwrap_or_default())
            .map(|e| e["name"].as_str().unwrap_or_default().to_owned())
            .collect()
    }

    pub fn crashes(&self) -> Vec<Value> {
        self.bodies("/v1/crashes")
            .iter()
            .flat_map(|b| b["crashes"].as_array().cloned().unwrap_or_default())
            .collect()
    }

    fn reply(&self, path: &str) -> Result<Reply, String> {
        if self.offline.load(Ordering::SeqCst) {
            return Err("offline".to_owned());
        }
        let body = if path == "/v1/ai/run" {
            self.ai_body.lock().unwrap().clone()
        } else {
            String::new()
        };
        Ok(Reply {
            status: self.status.load(Ordering::SeqCst),
            body,
        })
    }
}

impl Transport for Fake {
    fn get(&self, path: &str, if_none_match: Option<&str>) -> Result<Reply, String> {
        if self.offline.load(Ordering::SeqCst) {
            return Err("offline".to_owned());
        }
        self.gets
            .lock()
            .unwrap()
            .push((path.to_owned(), if_none_match.map(str::to_owned)));
        let body = self.config_body.lock().unwrap().clone();
        Ok(Reply {
            status: if body.is_empty() { 304 } else { 200 },
            body,
        })
    }

    fn post_json(&self, path: &str, body: &str) -> Result<Reply, String> {
        let reply = self.reply(path);
        if reply.is_ok() {
            let json = serde_json::from_str(body).unwrap();
            self.posts.lock().unwrap().push((path.to_owned(), json));
        }
        reply
    }

    fn put_bytes(
        &self,
        path: &str,
        filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<Reply, String> {
        let reply = self.reply(path);
        if reply.is_ok() {
            let put = Put {
                path: path.to_owned(),
                filename: filename.to_owned(),
                content_type: content_type.to_owned(),
                bytes: bytes.to_vec(),
            };
            self.puts.lock().unwrap().push(put);
        }
        reply
    }
}

/// Panics off (they're global), and no timer flushes: tests call `flush()` themselves.
pub fn config(fake: &Arc<Fake>) -> Config {
    let transport: Arc<dyn Transport> = fake.clone();
    Config::new("http://roost.test", "rk_client_test", "player-1", "1.0.0")
        .transport(transport)
        .capture_panics(false)
        .flush_interval(Duration::from_secs(3600))
        .timeout(Duration::from_secs(2))
}

pub fn temp_dir(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("roost-sdk-{name}-{}-{nanos}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}
