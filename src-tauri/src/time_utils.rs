use chrono::{DateTime, Duration, FixedOffset, NaiveDateTime, TimeZone, Utc};

const SHANGHAI_OFFSET_SECONDS: i32 = 8 * 60 * 60;
const SHANGHAI_DATETIME_FORMAT: &str = "%Y-%m-%d %H:%M:%S";
const SQLITE_DATETIME_FORMAT: &str = "%Y-%m-%d %H:%M:%S";
const SQLITE_DATETIME_WITH_FRACTION_FORMAT: &str = "%Y-%m-%d %H:%M:%S%.f";
const NAIVE_ISO_FORMAT: &str = "%Y-%m-%dT%H:%M:%S";
const NAIVE_ISO_WITH_FRACTION_FORMAT: &str = "%Y-%m-%dT%H:%M:%S%.f";

fn shanghai_offset() -> FixedOffset {
    FixedOffset::east_opt(SHANGHAI_OFFSET_SECONDS).expect("valid +08:00 fixed offset")
}

fn format_shanghai_datetime<Tz: TimeZone>(datetime: DateTime<Tz>) -> String {
    datetime
        .with_timezone(&shanghai_offset())
        .format(SHANGHAI_DATETIME_FORMAT)
        .to_string()
}

pub fn now_shanghai_string() -> String {
    format_shanghai_datetime(Utc::now())
}

pub fn shanghai_time_days_ago(days: i64) -> String {
    let safe_days = days.max(0);
    let dt = Utc::now() - Duration::days(safe_days);
    format_shanghai_datetime(dt)
}

pub fn shanghai_time_from_unix(seconds: i64) -> String {
    let utc = DateTime::<Utc>::from_timestamp(seconds, 0).unwrap_or_else(|| {
        DateTime::<Utc>::from_timestamp(0, 0).expect("unix epoch should be valid")
    });
    format_shanghai_datetime(utc)
}

pub fn normalize_to_shanghai(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Ok(dt) = DateTime::parse_from_rfc3339(trimmed) {
        return format_shanghai_datetime(dt);
    }

    let parsed_naive = NaiveDateTime::parse_from_str(trimmed, SQLITE_DATETIME_FORMAT)
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, SQLITE_DATETIME_WITH_FRACTION_FORMAT))
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, NAIVE_ISO_FORMAT))
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, NAIVE_ISO_WITH_FRACTION_FORMAT));

    if let Ok(naive) = parsed_naive {
        if let Some(local) = shanghai_offset().from_local_datetime(&naive).single() {
            return local.format(SHANGHAI_DATETIME_FORMAT).to_string();
        }
    }

    trimmed.to_string()
}
