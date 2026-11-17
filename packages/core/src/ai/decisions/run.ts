import type { AiDecide, DecisionAnswer } from "@roost/contracts";
import { checkLimits } from "../limits.ts";
import type { RunDeps } from "../run.ts";
import { UpstreamError } from "../upstream/openrouter.ts";
import { logCall, type CallLog } from "../usage.ts";
import { loadDecision } from "./store.ts";
import { decide } from "./upstream.ts";

export type DecisionResult =
  | { ok: true; answers: Record<string, DecisionAnswer>; model: string; tokensIn: number; tokensOut: number }
  | { ok: false; code: "unavailable" | "not_found" | "rate_limited" | "upstream_error"; message: string };

/**
 * Runs a game's decision template for one player: same limits and logging as prompt templates,
 * so spend caps and the dashboard count decisions too (logged under the decision's name).
 */
export async function runDecision(deps: RunDeps, environmentId: string, req: AiDecide): Promise<DecisionResult> {
  if (!deps.apiKey) return { ok: false, code: "unavailable", message: "The AI proxy isn't configured on this server." };
  const found = await loadDecision(deps.db, environmentId, req.decision);
  if (!found) return { ok: false, code: "not_found", message: `No AI decision named "${req.decision}" for this game.` };
  const { decision, gameId } = found;
  const log: Omit<CallLog, "status"> = {
    gameId,
    environmentId,
    template: decision.name,
    templateVersion: decision.version,
    model: decision.model,
    playerId: req.playerId,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    latencyMs: 0,
  };
  const refusal = await checkLimits(deps, gameId, req.playerId);
  if (refusal) {
    await logCall(deps.ch, { ...log, status: refusal.status });
    return { ok: false, code: "rate_limited", message: refusal.message };
  }
  const started = Date.now();
  try {
    const result = await decide({ apiKey: deps.apiKey, model: decision.model, state: req.state, questions: decision.questions, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    // The game reads answers by question name, so a partial answer is as bad as none. It was
    // still billed, so it's logged with its cost either way.
    const missing = Object.keys(decision.questions).filter((q) => !(q in result.answers));
    const usage = { model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: result.costUsd, latencyMs: Date.now() - started };
    await logCall(deps.ch, { ...log, ...usage, status: missing.length > 0 ? "error" : "ok" });
    if (missing.length > 0) return { ok: false, code: "upstream_error", message: `OpenRouter left questions unanswered: ${missing.join(", ")}` };
    return { ok: true, answers: result.answers, model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
  } catch (err) {
    await logCall(deps.ch, { ...log, status: "error", latencyMs: Date.now() - started });
    if (err instanceof UpstreamError) return { ok: false, code: "upstream_error", message: err.message };
    throw err;
  }
}
