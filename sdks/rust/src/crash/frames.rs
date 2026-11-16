use crate::model::{Frame, truncate};

/// Frames from the panic/backtrace machinery and this SDK. Leading ones are cut so the
/// top frame is where the game actually failed.
const INTERNAL: &[&str] = &[
    "std::",
    "core::",
    "alloc::",
    "roost_sdk::",
    "backtrace::",
    "rust_begin_unwind",
    "__rust",
    "<std::",
    "<core::",
    "<alloc::",
    "<roost_sdk::",
];

/// Process/thread start-up code: never the game's.
const RUNTIME_PREFIXES: &[&str] = &[
    "_start",
    "__libc_start",
    "start_thread",
    "thread_start",
    "_pthread_start",
    "__pthread",
    "BaseThreadInitThunk",
    "RtlUserThreadStart",
    "invoke_main",
    "__scrt_common_main",
];
/// Matched exactly, so a game's `main_menu::open` still counts as the game's.
const RUNTIME_EXACT: &[&str] = &["main", "_main", "<unknown>"];

/// Parses `std::backtrace::Backtrace`'s text into frames, innermost first:
///
/// ```text
///    3: my_game::save::load
///              at ./src/save.rs:42:9
/// ```
///
/// `in_app` lists crate prefixes that are the game's own code (`["my_game::"]`).
/// Empty means "anything that isn't std, core, alloc, this SDK or start-up code".
pub(crate) fn parse_backtrace(text: &str, in_app: &[String]) -> Vec<Frame> {
    let mut frames: Vec<Frame> = Vec::new();
    for line in text.lines().map(str::trim) {
        if let Some(location) = line.strip_prefix("at ") {
            if let Some(frame) = frames.last_mut() {
                set_location(frame, location);
            }
        } else if let Some((index, function)) = line.split_once(": ")
            && !index.is_empty()
            && index.chars().all(|c| c.is_ascii_digit())
        {
            let function = Some(truncate(function, 256));
            frames.push(Frame {
                function,
                ..Frame::default()
            });
        }
    }
    let first_real = frames
        .iter()
        .position(|f| !is_internal(name(f)))
        .unwrap_or(0);
    frames.drain(..first_real);
    frames.truncate(100);
    for frame in &mut frames {
        frame.in_app = Some(is_in_app(name(frame), in_app));
    }
    frames
}

fn name(frame: &Frame) -> &str {
    frame.function.as_deref().unwrap_or("")
}

fn is_internal(function: &str) -> bool {
    INTERNAL.iter().any(|p| function.starts_with(p))
}

fn is_in_app(function: &str, in_app: &[String]) -> bool {
    if !in_app.is_empty() {
        // `<my_game::Foo as Trait>::bar` belongs to the game too.
        let bare = function.trim_start_matches('<');
        return in_app.iter().any(|p| bare.starts_with(p.as_str()));
    }
    !is_internal(function)
        && !RUNTIME_EXACT.contains(&function)
        && !RUNTIME_PREFIXES.iter().any(|p| function.starts_with(p))
}

/// `path/to/file.rs:12:5`; Windows drive letters survive because we split from the right.
fn set_location(frame: &mut Frame, location: &str) {
    let mut parts = location.rsplitn(3, ':');
    let column = parts.next().and_then(|c| c.parse().ok());
    let line = parts.next().and_then(|l| l.parse().ok());
    match (parts.next(), line, column) {
        (Some(file), Some(line), Some(column)) => {
            frame.file = Some(truncate(file, 512));
            frame.line = Some(line);
            frame.column = Some(column);
        }
        _ => frame.file = Some(truncate(location, 512)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "   0: std::backtrace_rs::backtrace::libunwind::trace
             at /rustc/abc/library/std/src/../../backtrace/src/backtrace/libunwind.rs:116:5
   1: std::backtrace::Backtrace::create
   2: roost_sdk::crash::panic::describe
             at ./src/crash/panic.rs:30:14
   3: std::panicking::rust_panic_with_hook
   4: my_game::save::load
             at ./src/save.rs:42:9
   5: <my_game::World as engine::System>::tick
             at C:\\games\\src\\world.rs:7:1
   6: engine::run
             at ./engine/src/lib.rs:88:3
   7: std::rt::lang_start_internal
   8: main
   9: __libc_start_main";

    #[test]
    fn strips_leading_machinery_and_reads_locations() {
        let frames = parse_backtrace(SAMPLE, &[]);
        assert_eq!(frames[0].function.as_deref(), Some("my_game::save::load"));
        assert_eq!(frames[0].file.as_deref(), Some("./src/save.rs"));
        assert_eq!((frames[0].line, frames[0].column), (Some(42), Some(9)));
        assert_eq!(frames[1].file.as_deref(), Some("C:\\games\\src\\world.rs"));
    }

    #[test]
    fn marks_in_app_by_default() {
        let frames = parse_backtrace(SAMPLE, &[]);
        let in_app: Vec<bool> = frames.iter().map(|f| f.in_app == Some(true)).collect();
        // load, World::tick, engine::run are app; lang_start, main, libc are not.
        assert_eq!(in_app, vec![true, true, true, false, false, false]);
    }

    #[test]
    fn marks_in_app_by_prefix() {
        let frames = parse_backtrace(SAMPLE, &["my_game::".to_owned()]);
        let in_app: Vec<bool> = frames.iter().map(|f| f.in_app == Some(true)).collect();
        assert_eq!(in_app, vec![true, true, false, false, false, false]);
    }
}
