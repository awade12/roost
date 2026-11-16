use std::time::Duration;

/// A response from the Roost API.
#[derive(Debug, Clone)]
pub struct Reply {
    pub status: u16,
    pub body: String,
}

/// How the SDK talks to the API. The default uses `ureq`; swap in your own to route
/// through the engine's HTTP stack, a proxy, or a fake in tests.
/// `path` starts with `/v1/`. Return `Err` only when no response came back (offline, timeout).
pub trait Transport: Send + Sync {
    fn post_json(&self, path: &str, body: &str) -> Result<Reply, String>;
    fn put_bytes(
        &self,
        path: &str,
        filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<Reply, String>;
}

/// What to do with a payload after a send attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Outcome {
    Sent,
    /// A 4xx other than 429: the payload itself is bad and retrying won't help.
    Rejected,
    /// Offline, timeout, 429 or 5xx: keep it and try later.
    Retry,
}

pub(crate) fn outcome(result: &Result<Reply, String>) -> Outcome {
    match result {
        Ok(r) if (200..300).contains(&r.status) => Outcome::Sent,
        Ok(r) if (400..500).contains(&r.status) && r.status != 429 => Outcome::Rejected,
        _ => Outcome::Retry,
    }
}

pub(crate) struct HttpTransport {
    agent: ureq::Agent,
    endpoint: String,
    client_key: String,
}

impl HttpTransport {
    pub(crate) fn new(endpoint: &str, client_key: &str, timeout: Duration) -> Self {
        let config = ureq::Agent::config_builder()
            .timeout_global(Some(timeout))
            // Status codes are data here (429 vs 400 decide retry vs drop), not errors.
            .http_status_as_error(false)
            .build();
        Self {
            agent: ureq::Agent::new_with_config(config),
            endpoint: endpoint.trim_end_matches('/').to_owned(),
            client_key: client_key.to_owned(),
        }
    }
}

impl Transport for HttpTransport {
    fn post_json(&self, path: &str, body: &str) -> Result<Reply, String> {
        let res = self
            .agent
            .post(format!("{}{path}", self.endpoint))
            .header("content-type", "application/json")
            .header("x-roost-key", &self.client_key)
            .send(body);
        read(res)
    }

    fn put_bytes(
        &self,
        path: &str,
        filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<Reply, String> {
        let res = self
            .agent
            .put(format!("{}{path}", self.endpoint))
            .header("content-type", content_type)
            .header("x-filename", percent_encode(filename))
            .header("x-roost-key", &self.client_key)
            .send(bytes);
        read(res)
    }
}

fn read(res: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<Reply, String> {
    let mut res = res.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let body = res.body_mut().read_to_string().unwrap_or_default();
    Ok(Reply { status, body })
}

/// Header values must be ASCII; the API decodes this with `decodeURIComponent`.
pub(crate) fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(char::from(b));
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_like_encode_uri_component() {
        assert_eq!(percent_encode("save 1.json"), "save%201.json");
        assert_eq!(percent_encode("é/x"), "%C3%A9%2Fx");
    }

    #[test]
    fn classifies_replies() {
        let r = |status| {
            Ok(Reply {
                status,
                body: String::new(),
            })
        };
        assert_eq!(outcome(&r(202)), Outcome::Sent);
        assert_eq!(outcome(&r(400)), Outcome::Rejected);
        assert_eq!(outcome(&r(429)), Outcome::Retry);
        assert_eq!(outcome(&r(503)), Outcome::Retry);
        assert_eq!(outcome(&Err("offline".into())), Outcome::Retry);
    }
}
