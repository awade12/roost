-- Analytics events. One row per event, append-only.
-- ReplacingMergeTree drops SDK retries (same id) during background merges, so
-- exact counts must use uniqExact(id) or FINAL until a merge has happened.
CREATE TABLE IF NOT EXISTS events
(
    id             UUID,
    environment_id UUID,
    name           LowCardinality(String),
    player_id      String,
    session_id     String,
    build          LowCardinality(String),
    platform       LowCardinality(String),
    value          Nullable(Float64),
    props          JSON,
    occurred_at    DateTime64(3, 'UTC'),
    received_at    DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(received_at)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (environment_id, name, toDate(occurred_at), player_id, id);
