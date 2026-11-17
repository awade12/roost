//! Getting payloads to the API: HTTP, the event queue, and on-disk persistence.

mod http;
mod queue;
mod store;

pub(crate) use http::{HttpTransport, Outcome, outcome, percent_encode};
pub use http::{Reply, Transport};
pub use queue::MAX_QUEUED;
pub(crate) use queue::Queue;
pub(crate) use store::{MAX_PENDING_CRASHES, PendingCrash, Store};
