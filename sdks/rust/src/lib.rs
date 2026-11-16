//! Roost SDK for the custom Rust engine.
//!
//! Rule: this crate must never crash the game. No `unwrap`, `expect` or `panic!`
//! (enforced by clippy lints in Cargo.toml). Every failure is swallowed or returned.
//!
//! Status: event model + queue. HTTP transport, panic hook, minidumps and Steam
//! ticket verification come next (SPEC.md build order step 4).

mod event;
mod queue;

pub use event::Event;
pub use queue::{MAX_QUEUED, Queue};
