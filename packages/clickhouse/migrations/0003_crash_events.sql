-- Every crash/error report, linked to its issue. Counts, players affected,
-- platform/build breakdowns and the latest stack all come from here.
CREATE TABLE IF NOT EXISTS crash_events
(
    id             UUID,
    environment_id UUID,
    issue_id       UUID,
    player_id      String,
    session_id     String,
    build          LowCardinality(String),
    platform       LowCardinality(String),
    os_version     String,
    device_model   String,
    kind           LowCardinality(String),
    type           String,
    message        String,
    stack          String,
    breadcrumbs    String,
    occurred_at    DateTime64(3, 'UTC'),
    received_at    DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(received_at)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (environment_id, issue_id, occurred_at, id);
