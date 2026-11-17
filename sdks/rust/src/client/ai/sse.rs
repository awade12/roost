use super::{AiResponse, AiUsage};
use crate::error::RoostError;
use serde::Deserialize;

#[derive(Deserialize)]
struct Delta {
    text: String,
}

#[derive(Deserialize)]
struct Done {
    model: String,
    usage: AiUsage,
}

#[derive(Deserialize)]
struct Failed {
    code: String,
    message: String,
}

/// Reads the proxy's Server-Sent Events line by line: `delta` text, then `done` or `error`.
pub(super) struct Reader<F: FnMut(&str)> {
    on_delta: F,
    event: String,
    text: String,
    outcome: Option<Result<AiResponse, RoostError>>,
}

impl<F: FnMut(&str)> Reader<F> {
    pub(super) fn new(on_delta: F) -> Self {
        Self {
            on_delta,
            event: String::new(),
            text: String::new(),
            outcome: None,
        }
    }

    pub(super) fn line(&mut self, line: &str) {
        if let Some(event) = line.strip_prefix("event:") {
            self.event = event.trim().to_owned();
            return;
        }
        let Some(data) = line.strip_prefix("data:").map(str::trim) else {
            return;
        };
        match self.event.as_str() {
            "delta" => {
                if let Ok(d) = serde_json::from_str::<Delta>(data) {
                    self.text.push_str(&d.text);
                    (self.on_delta)(&d.text);
                }
            }
            "done" => {
                if let Ok(d) = serde_json::from_str::<Done>(data) {
                    self.outcome = Some(Ok(AiResponse {
                        text: std::mem::take(&mut self.text),
                        model: d.model,
                        usage: d.usage,
                    }));
                }
            }
            "error" => {
                if let Ok(f) = serde_json::from_str::<Failed>(data) {
                    self.outcome = Some(Err(RoostError::Api {
                        status: 200,
                        code: f.code,
                        message: f.message,
                    }));
                }
            }
            _ => {}
        }
    }

    pub(super) fn finish(self) -> Result<AiResponse, RoostError> {
        self.outcome
            .unwrap_or_else(|| Err(RoostError::Network("the AI stream ended early".to_owned())))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_deltas_until_done() {
        let mut pieces = Vec::new();
        let mut r = Reader::new(|t: &str| pieces.push(t.to_owned()));
        for line in [
            "event: delta",
            r#"data: {"text":"Keep "}"#,
            "",
            "event: delta",
            r#"data: {"text":"moving."}"#,
            "",
            "event: done",
            r#"data: {"model":"m","usage":{"tokensIn":3,"tokensOut":2}}"#,
        ] {
            r.line(line);
        }
        let out = r.finish().unwrap_or_else(|_| AiResponse {
            text: String::new(),
            model: String::new(),
            usage: AiUsage {
                tokens_in: 0,
                tokens_out: 0,
            },
        });
        assert_eq!(out.text, "Keep moving.");
        assert_eq!(pieces, ["Keep ", "moving."]);
    }

    #[test]
    fn reports_errors_and_early_ends() {
        let mut r = Reader::new(|_: &str| {});
        r.line("event: error");
        r.line(r#"data: {"code":"rate_limited","message":"Budget used"}"#);
        assert!(
            matches!(r.finish(), Err(RoostError::Api { ref code, .. }) if code == "rate_limited")
        );
        assert!(matches!(
            Reader::new(|_: &str| {}).finish(),
            Err(RoostError::Network(_))
        ));
    }
}
