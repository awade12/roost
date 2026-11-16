import type { Clickhouse } from "@roost/clickhouse";
import type { AiRun } from "@roost/contracts";
import type { Db } from "@roost/db";
import { chat, UpstreamError } from "./openrouter.ts";
import { renderTemplate } from "./render.ts";
import { getLimits, loadTemplate } from "./templates/index.ts";
import { limitCounters, logCall, type CallLog } from "./usage.ts";

export type RunDeps = { db: Db; ch: Clickhouse; apiKey: string | undefined; fetch?: typeof fetch };

type Failure = {
  ok: false;
  code: "unavailable" | "not_found" | "bad_request" | "rate_limited" | "upstream_error";
  message: string;
};
export type RunResult = { ok: true; text: string; model: string; tokensIn: number; tokensOut: number } | Failure;

const fail = (code: Failure["code"], message: string): Failure => ({ ok: false, code, message });

type Template = NonNullable<Awaited<ReturnType<typeof loadTemplate>>>;

/** Checks per-minute, per-player daily and per-game monthly limits. Returns the refusal, if any. */
async function checkLimits(deps: RunDeps, found: Template, playerId: string) {
  const [limits, counters] = await Promise.all([
    getLimits(deps.db, found.gameId),
    limitCounters(deps.ch, found.gameId, playerId),
  ]);
  if (counters.playerCallsLastMinute >= limits.playerPerMinute) {
    return { status: "rate_limited" as const, message: "Too many AI requests from this player. Try again in a minute." };
  }
  if (counters.playerTokensToday >= limits.playerDailyTokens) {
    return { status: "over_budget" as const, message: "This player has used today's AI budget." };
  }
  if (counters.spendUsd * 100 >= limits.monthlyCapCents) {
    return { status: "over_cap" as const, message: "This game has reached its monthly AI spend cap." };
  }
  return null;
}

/**
 * Runs a game's prompt template for one player. Every outcome, including
 * refusals, is logged to ai_calls so limits and the dashboard see it.
 */
export async function runTemplate(deps: RunDeps, environmentId: string, req: AiRun): Promise<RunResult> {
  if (!deps.apiKey) return fail("unavailable", "The AI proxy isn't configured on this server.");
  const found = await loadTemplate(deps.db, environmentId, req.template);
  if (!found) return fail("not_found", `No AI template named "${req.template}" for this game.`);
  const { template } = found;

  const rendered = renderTemplate(template.userTemplate, req.vars);
  if (!rendered.ok) return fail("bad_request", `Missing template variables: ${rendered.missing.join(", ")}`);

  const base: Omit<CallLog, "status" | "model"> = {
    gameId: found.gameId,
    environmentId,
    template: template.name,
    templateVersion: template.version,
    playerId: req.playerId,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    latencyMs: 0,
  };
  const refusal = await checkLimits(deps, found, req.playerId);
  if (refusal) {
    await logCall(deps.ch, { ...base, model: template.model, status: refusal.status });
    return fail("rate_limited", refusal.message);
  }

  const started = Date.now();
  try {
    const result = await chat({
      apiKey: deps.apiKey,
      models: [template.model, ...template.fallbackModels],
      messages: [
        { role: "system", content: template.systemPrompt },
        { role: "user", content: rendered.text },
      ],
      maxTokens: template.maxTokens,
      temperature: template.temperature,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });
    await logCall(deps.ch, { ...base, ...result, status: "ok", latencyMs: Date.now() - started });
    return { ok: true, text: result.text, model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
  } catch (err) {
    await logCall(deps.ch, { ...base, model: template.model, status: "error", latencyMs: Date.now() - started });
    if (err instanceof UpstreamError) return fail("upstream_error", err.message);
    throw err;
  }
}
