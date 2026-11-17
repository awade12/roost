//! Wire types shared with `packages/contracts`. Field names match the JSON the API expects.

mod context;
mod crash;
mod event;
mod time;

pub use context::{DeviceContext, Platform};
pub use crash::{AttachmentRef, Breadcrumb, BreadcrumbLevel, Crash, Frame, JsonMap, Kind, Level};
pub use event::{Event, Props, TrackEvent};
pub(crate) use event::{is_valid_event_name, truncate};
#[cfg(feature = "native-crashes")]
pub(crate) use time::rfc3339;
pub(crate) use time::{new_id, now_rfc3339};
