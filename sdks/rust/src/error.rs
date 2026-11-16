use std::fmt;

/// The only errors the SDK returns: bad config at `start`, and `ai` calls.
/// Tracking and crash reporting never fail loudly.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoostError {
    Config(String),
    /// No response: offline or timed out.
    Network(String),
    /// The API answered with an error, e.g. `code: "rate_limited"`.
    Api {
        status: u16,
        code: String,
        message: String,
    },
    /// A response or value couldn't be (de)serialized.
    Decode(String),
}

impl fmt::Display for RoostError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config(m) => write!(f, "roost config: {m}"),
            Self::Network(m) => write!(f, "roost network: {m}"),
            Self::Api {
                status,
                code,
                message,
            } => write!(f, "roost api {status} {code}: {message}"),
            Self::Decode(m) => write!(f, "roost decode: {m}"),
        }
    }
}

impl std::error::Error for RoostError {}
