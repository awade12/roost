use super::Roost;
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

#[derive(Deserialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Deserialize)]
struct ErrorDetail {
    code: String,
    message: String,
}

impl Roost {
    /// Runs a prompt template from the dashboard on the AI proxy. **Blocks** for the whole
    /// model call, so call it off the main/render thread.
    ///
    /// `vars` fills the template's `{{placeholders}}`: a struct or map of strings, numbers and
    /// booleans. Fails with `RoostError::Api { code: "rate_limited", .. }` when the player's
    /// budget is used up, so the game can show its own fallback line.
    pub fn ai(&self, template: &str, vars: impl Serialize) -> Result<AiResponse, RoostError> {
        let vars =
            match serde_json::to_value(vars).map_err(|e| RoostError::Decode(e.to_string()))? {
                serde_json::Value::Null => serde_json::json!({}),
                v => v,
            };
        let body = serde_json::json!({ "template": template, "vars": vars, "playerId": self.shared.config.player_id });
        let reply = self
            .shared
            .transport
            .post_json("/v1/ai/run", &body.to_string())
            .map_err(RoostError::Network)?;
        if !(200..300).contains(&reply.status) {
            let (code, message) = match serde_json::from_str::<ErrorBody>(&reply.body) {
                Ok(b) => (b.error.code, b.error.message),
                Err(_) => ("internal".to_owned(), format!("HTTP {}", reply.status)),
            };
            return Err(RoostError::Api {
                status: reply.status,
                code,
                message,
            });
        }
        serde_json::from_str(&reply.body).map_err(|e| RoostError::Decode(e.to_string()))
    }
}
