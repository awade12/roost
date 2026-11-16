use super::build::Raw;
use super::frames::parse_backtrace;
use crate::model::{Frame, Kind};
use std::backtrace::Backtrace;
use std::cell::Cell;
use std::panic::{self, PanicHookInfo};

thread_local! {
    /// Stops the hook re-entering if reporting itself panics on this thread.
    static IN_HOOK: Cell<bool> = const { Cell::new(false) };
}

/// Chains a panic hook in front of the existing one (which still prints the usual message).
pub(crate) fn install(handler: impl Fn(&PanicHookInfo<'_>) + Send + Sync + 'static) {
    let previous = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        if !IN_HOOK.with(|busy| busy.replace(true)) {
            handler(info);
            IN_HOOK.with(|busy| busy.set(false));
        }
        previous(info);
    }));
}

pub(crate) fn describe(info: &PanicHookInfo<'_>, in_app: &[String]) -> Raw {
    let message = info
        .payload_as_str()
        .unwrap_or("panic with a non-string payload")
        .to_owned();
    let backtrace = Backtrace::force_capture().to_string();
    let frames = parse_backtrace(&backtrace, in_app);
    let stack = match info.location() {
        Some(at) => format!(
            "panicked at {}:{}:{}\n{backtrace}",
            at.file(),
            at.line(),
            at.column()
        ),
        None => backtrace,
    };
    Raw {
        kind: Kind::Crash,
        error_type: "panic".to_owned(),
        message,
        stack,
        frames: Some(frames),
    }
}

/// Stack text and frames for a caught error: its `source()` chain, then where it was captured.
pub(crate) fn describe_error(
    error: &(dyn std::error::Error + '_),
    in_app: &[String],
) -> (String, Vec<Frame>) {
    let mut stack = String::new();
    let mut source = error.source();
    while let Some(cause) = source {
        stack.push_str(&format!("Caused by: {cause}\n"));
        source = cause.source();
    }
    let backtrace = Backtrace::force_capture().to_string();
    let frames = parse_backtrace(&backtrace, in_app);
    stack.push_str(&backtrace);
    (stack, frames)
}

/// `std::io::error::Error` → `Error`; `dyn core::error::Error` → `Error`.
pub(crate) fn short_type_name(full: &str) -> String {
    let base = full.split('<').next().unwrap_or(full);
    match base.rsplit("::").next() {
        Some(last) if !full.starts_with("dyn ") && !last.is_empty() => last.to_owned(),
        _ => "Error".to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortens_type_names() {
        assert_eq!(short_type_name("std::io::error::Error"), "Error");
        assert_eq!(short_type_name("my_game::save::SaveCorrupt"), "SaveCorrupt");
        assert_eq!(short_type_name("dyn core::error::Error"), "Error");
        assert_eq!(
            short_type_name("my_game::Wrapper<std::io::Error>"),
            "Wrapper"
        );
    }
}
