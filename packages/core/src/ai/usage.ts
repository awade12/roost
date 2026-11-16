import type { Clickhouse } from "@roost/clickhouse";

export type CallStatus = "ok" | "error" | "rate_limited" | "over_budget" | "over_cap";

export type CallLog = {
  gameId: string;
  environmentId: string;
  template: string;
  templateVersion: number;
  model: string;
  playerId: string;
  status: CallStatus;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
};

export async function logCall(ch: Clickhouse, call: CallLog): Promise<void> {
  await ch.insert({
    table: "ai_calls",
    format: "JSONEachRow",
    values: [
      {
        id: crypto.randomUUID(),
        game_id: call.gameId,
        environment_id: call.environmentId,
        template: call.template,
        template_version: call.templateVersion,
        model: call.model,
        player_id: call.playerId,
        status: call.status,
        tokens_in: call.tokensIn,
        tokens_out: call.tokensOut,
        cost_usd: call.costUsd,
        latency_ms: call.latencyMs,
      },
    ],
  });
}

async function one<T>(ch: Clickhouse, query: string, params: Record<string, string>): Promise<T | undefined> {
  const result = await ch.query({ query, query_params: params, format: "JSONEachRow" });
  return (await result.json<T>())[0];
}

/** Everything the limit checks need, in one round trip. */
export async function limitCounters(ch: Clickhouse, gameId: string, playerId: string) {
  const row = await one<{ spend: number; tokens_today: string; calls_minute: string }>(
    ch,
    `SELECT
       sumIf(cost_usd, created_at >= toStartOfMonth(now())) AS spend,
       sumIf(tokens_in + tokens_out, player_id = {player:String} AND created_at >= today()) AS tokens_today,
       countIf(player_id = {player:String} AND created_at >= now() - INTERVAL 1 MINUTE) AS calls_minute
     FROM ai_calls
     WHERE game_id = {game:UUID} AND created_at >= least(toStartOfMonth(now()), today()) AND status = 'ok'`,
    { game: gameId, player: playerId },
  );
  return {
    spendUsd: Number(row?.spend ?? 0),
    playerTokensToday: Number(row?.tokens_today ?? 0),
    playerCallsLastMinute: Number(row?.calls_minute ?? 0),
  };
}

export type TemplateUsage = { template: string; requests: number; errors: number; tokensIn: number; tokensOut: number; costUsd: number };

/** Usage for the dashboard: month-to-date spend, and per-template stats for the last 30 days. */
export async function usageSummary(ch: Clickhouse, gameId: string) {
  const totals = await one<{ spend: number; requests: string; blocked: string; p50: number }>(
    ch,
    `SELECT
       sumIf(cost_usd, created_at >= toStartOfMonth(now())) AS spend,
       countIf(created_at >= now() - INTERVAL 30 DAY) AS requests,
       countIf(status IN ('rate_limited', 'over_budget', 'over_cap') AND created_at >= now() - INTERVAL 30 DAY) AS blocked,
       quantileIf(0.5)(latency_ms, status = 'ok' AND created_at >= now() - INTERVAL 30 DAY) AS p50
     FROM ai_calls WHERE game_id = {game:UUID}`,
    { game: gameId },
  );
  const result = await ch.query({
    query: `SELECT template, count() AS requests, countIf(status = 'error') AS errors,
              sum(tokens_in) AS tokens_in, sum(tokens_out) AS tokens_out, sum(cost_usd) AS cost
            FROM ai_calls WHERE game_id = {game:UUID} AND created_at >= now() - INTERVAL 30 DAY
            GROUP BY template ORDER BY requests DESC`,
    query_params: { game: gameId },
    format: "JSONEachRow",
  });
  const rows = await result.json<{ template: string; requests: string; errors: string; tokens_in: string; tokens_out: string; cost: number }>();
  const requests = Number(totals?.requests ?? 0);
  return {
    spendMonthUsd: Number(totals?.spend ?? 0),
    requests30d: requests,
    blockedRate: requests > 0 ? Number(totals?.blocked ?? 0) / requests : 0,
    p50LatencyMs: Number.isFinite(Number(totals?.p50)) ? Math.round(Number(totals?.p50 ?? 0)) : 0,
    byTemplate: rows.map(
      (r): TemplateUsage => ({
        template: r.template,
        requests: Number(r.requests),
        errors: Number(r.errors),
        tokensIn: Number(r.tokens_in),
        tokensOut: Number(r.tokens_out),
        costUsd: Number(r.cost),
      }),
    ),
  };
}
