import type { Clickhouse } from "@roost/clickhouse";
import type { EventBatch } from "@roost/contracts";

/**
 * Stores a validated batch for one environment in ClickHouse.
 * Retries of the same event (same id) are dropped by the table engine
 * (ReplacingMergeTree), so sending a batch twice is safe.
 */
export async function insertBatch(ch: Clickhouse, environmentId: string, batch: EventBatch): Promise<void> {
  const rows = batch.events.map((e) => ({
    id: e.id,
    environment_id: environmentId,
    name: e.name,
    player_id: e.playerId,
    session_id: e.sessionId,
    build: batch.context.build,
    platform: batch.context.platform,
    value: e.value ?? null,
    props: e.props ?? {},
    // ClickHouse DateTime64 wants "YYYY-MM-DD hh:mm:ss.sss" in UTC.
    occurred_at: new Date(e.ts).toISOString().replace("T", " ").replace("Z", ""),
  }));
  await ch.insert({ table: "events", values: rows, format: "JSONEachRow" });
}
