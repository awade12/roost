-- One row per AI proxy call (success or refusal). Drives spend caps, player
-- budgets and the AI usage dashboard. Append-only.
CREATE TABLE IF NOT EXISTS ai_calls
(
    id               UUID,
    game_id          UUID,
    environment_id   UUID,
    template         LowCardinality(String),
    template_version UInt32,
    model            LowCardinality(String),
    player_id        String,
    -- ok | error | rate_limited | over_budget | over_cap
    status           LowCardinality(String),
    tokens_in        UInt32,
    tokens_out       UInt32,
    cost_usd         Float64,
    latency_ms       UInt32,
    created_at       DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (game_id, created_at, player_id);
