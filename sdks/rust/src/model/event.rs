use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Event props: values are strings, numbers, booleans or null.
pub type Props = BTreeMap<String, serde_json::Value>;

/// One analytics event as sent to `/v1/events`. Mirrors `EventSchema` in `packages/contracts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub name: String,
    pub ts: String,
    pub session_id: String,
    pub player_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub props: Props,
}

/// An event to track, built up before sending:
/// `TrackEvent::new("level_complete").prop("level", 3).value(42.0)`.
#[derive(Debug, Clone)]
pub struct TrackEvent {
    pub(crate) name: String,
    pub(crate) props: Props,
    pub(crate) value: Option<f64>,
}

impl TrackEvent {
    /// `name` must be snake_case (`level_complete`), max 64 chars. Invalid names are dropped.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            props: Props::new(),
            value: None,
        }
    }

    /// Strings (max 1024 chars), numbers, booleans or null. Objects and arrays are sent as JSON text.
    pub fn prop(mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) -> Self {
        self.props
            .insert(key.into(), flat_value(value.into(), 1024));
        self
    }

    /// A number to sum or average in analytics (score, coins, seconds).
    pub fn value(mut self, value: f64) -> Self {
        self.value = value.is_finite().then_some(value);
        self
    }
}

/// The server rejects a whole batch over one bad name, so bad names never get queued.
pub(crate) fn is_valid_event_name(name: &str) -> bool {
    let mut chars = name.chars();
    let first_ok = chars.next().is_some_and(|c| c.is_ascii_lowercase());
    first_ok
        && name.len() <= 64
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

/// Props only allow scalars; nested values become their JSON text.
pub(crate) fn flat_value(value: serde_json::Value, max_len: usize) -> serde_json::Value {
    use serde_json::Value;
    match value {
        Value::String(s) => Value::String(truncate(&s, max_len)),
        Value::Array(_) | Value::Object(_) => Value::String(truncate(&value.to_string(), max_len)),
        Value::Number(n) if n.as_f64().is_some_and(f64::is_finite) => Value::Number(n),
        Value::Number(_) => Value::Null,
        other => other,
    }
}

/// Cuts to at most `max` chars without splitting a UTF-8 character.
pub(crate) fn truncate(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_names() {
        assert!(is_valid_event_name("level_complete"));
        assert!(is_valid_event_name("a1"));
        assert!(!is_valid_event_name("Level"));
        assert!(!is_valid_event_name("1st"));
        assert!(!is_valid_event_name("has space"));
        assert!(!is_valid_event_name(""));
        assert!(!is_valid_event_name(&"a".repeat(65)));
    }

    #[test]
    fn flattens_nested_props() {
        let e = TrackEvent::new("x")
            .prop("obj", serde_json::json!({ "a": 1 }))
            .prop("n", 2);
        assert_eq!(e.props["obj"], serde_json::json!("{\"a\":1}"));
        assert_eq!(e.props["n"], serde_json::json!(2));
    }

    #[test]
    fn drops_non_finite_values() {
        assert_eq!(TrackEvent::new("x").value(f64::NAN).value, None);
    }
}
