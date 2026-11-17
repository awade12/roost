//! The AI proxy: run a dashboard template, optionally with history and per-call options,
//! as one answer or streamed piece by piece.

mod sse;

use super::Roost;
use super::calls::api_error;
use crate::error::RoostError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct AiResponse {
    pub text: String,
    /// The model that answered (may be a fallback).
    pub model: String,
    pub usage: AiUsage,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsage {
    pub tokens_in: u64,
    pub tokens_out: u64,
}

/// One earlier turn of a conversation.
#[derive(Debug, Clone, Serialize)]
pub struct AiTurn {
    /// "user" or "assistant".
    pub role: String,
    pub content: String,
}

impl AiTurn {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_owned(),
            content: content.into(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".to_owned(),
            content: content.into(),
        }
    }
}

/// Per-call options, within what the template allows.
#[derive(Debug, Clone, Default)]
pub struct AiOptions {
    /// Earlier turns, so an NPC remembers the conversation. They go before the template's message.
    pub messages: Vec<AiTurn>,
    /// One of the template's models (its main model or a fallback).
    pub model: Option<String>,
    /// Up to the template's max tokens.
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

fn request_body(
    roost: &Roost,
    template: &str,
    vars: impl Serialize,
    o: &AiOptions,
    stream: bool,
) -> Result<String, RoostError> {
    let vars = match serde_json::to_value(vars).map_err(|e| RoostError::Decode(e.to_string()))? {
        serde_json::Value::Null => serde_json::json!({}),
        v => v,
    };
    let mut body = serde_json::json!({ "template": template, "vars": vars, "playerId": roost.shared.config.player_id });
    if !o.messages.is_empty() {
        body["messages"] = serde_json::to_value(&o.messages).unwrap_or_default();
    }
    let mut options = serde_json::Map::new();
    if let Some(m) = &o.model {
        options.insert("model".to_owned(), m.clone().into());
    }
    if let Some(t) = o.max_tokens {
        options.insert("maxTokens".to_owned(), t.into());
    }
    if let Some(t) = o.temperature {
        options.insert("temperature".to_owned(), t.into());
    }
    if !options.is_empty() {
        body["options"] = options.into();
    }
    if stream {
        body["stream"] = true.into();
    }
    Ok(body.to_string())
}

impl Roost {
    /// Runs a prompt template from the dashboard on the AI proxy. **Blocks** for the whole
    /// model call, so call it off the main/render thread.
    ///
    /// `vars` fills the template's `{{placeholders}}`. Fails with
    /// `RoostError::Api { code: "rate_limited", .. }` when the player's budget is used up, so the
    /// game can show its own fallback line.
    pub fn ai(&self, template: &str, vars: impl Serialize) -> Result<AiResponse, RoostError> {
        self.ai_with(template, vars, &AiOptions::default())
    }

    /// `ai` with conversation history and per-call options.
    pub fn ai_with(
        &self,
        template: &str,
        vars: impl Serialize,
        options: &AiOptions,
    ) -> Result<AiResponse, RoostError> {
        let body = request_body(self, template, vars, options, false)?;
        let reply = self
            .shared
            .transport
            .post_json("/v1/ai/run", &body)
            .map_err(RoostError::Network)?;
        if !(200..300).contains(&reply.status) {
            return Err(api_error(&reply));
        }
        serde_json::from_str(&reply.body).map_err(|e| RoostError::Decode(e.to_string()))
    }

    /// Like `ai_with`, but `on_delta` gets each piece of text as it's written (typewriter
    /// dialogue). Blocks until the answer is complete; returns the whole answer.
    pub fn ai_stream(
        &self,
        template: &str,
        vars: impl Serialize,
        options: &AiOptions,
        on_delta: impl FnMut(&str),
    ) -> Result<AiResponse, RoostError> {
        let body = request_body(self, template, vars, options, true)?;
        let mut reader = sse::Reader::new(on_delta);
        let reply = self
            .shared
            .transport
            .post_stream("/v1/ai/run", &body, &mut |line| reader.line(line))
            .map_err(RoostError::Network)?;
        if !(200..300).contains(&reply.status) {
            return Err(api_error(&reply));
        }
        reader.finish()
    }
}
