use std::time::{SystemTime, UNIX_EPOCH};

/// Current UTC time as RFC 3339 with milliseconds, e.g. `2026-11-16T09:15:20.052Z`.
/// Hand-rolled so the SDK doesn't need a date crate for one format.
pub(crate) fn now_rfc3339() -> String {
    let since = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = i64::try_from(since.as_secs()).unwrap_or(0);
    format_rfc3339(secs, since.subsec_millis())
}

pub(crate) fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn format_rfc3339(secs: i64, millis: u32) -> String {
    let (y, m, d) = civil_from_days(secs.div_euclid(86_400));
    let rem = secs.rem_euclid(86_400);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

/// Days since 1970-01-01 to (year, month, day). Howard Hinnant's `civil_from_days`.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    (y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_known_instants() {
        assert_eq!(format_rfc3339(0, 0), "1970-01-01T00:00:00.000Z");
        assert_eq!(format_rfc3339(1_700_000_000, 5), "2023-11-14T22:13:20.005Z");
        assert_eq!(format_rfc3339(951_782_400, 0), "2000-02-29T00:00:00.000Z");
        assert_eq!(
            format_rfc3339(4_102_444_799, 999),
            "2099-12-31T23:59:59.999Z"
        );
    }

    #[test]
    fn ids_are_uuids() {
        assert_eq!(new_id().len(), 36);
    }
}
