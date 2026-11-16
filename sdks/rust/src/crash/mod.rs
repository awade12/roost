//! Crash and error reports: the scope, building reports within the contract, and the panic hook.

mod build;
mod frames;
mod panic;
mod scope;

pub use build::{
    Attachment, Capture, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, PANIC_ATTACHMENT_BUDGET,
};
pub(crate) use build::{Raw, Who, build, to_object};
pub(crate) use panic::{describe, describe_error, install, short_type_name};
pub(crate) use scope::Scope;
