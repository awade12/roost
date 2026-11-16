use serde::Serialize;
use std::collections::BTreeMap;

/// One analytics event. Mirrors `EventSchema` in `packages/contracts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub name: String,
    pub ts: String,
    pub session_id: String,
    pub player_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub props: BTreeMap<String, serde_json::Value>,
}
