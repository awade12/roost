import type { Clickhouse } from "@roost/clickhouse";
import type { AiComplete, AiRun } from "@roost/contracts";
import type { Db } from "@roost/db";
import { renderTemplate } from "./render.ts";
import { checkLimits } from "./limits.ts";
import { loadTemplate } from "./templates/index.ts";
import { chat, UpstreamError, type ChatMessage } from "./upstream/openrouter.ts";
import { chatStream } from "./upstream/stream.ts";
import { logCall, type CallLog } from "./usage.ts";

export type RunDeps = {
  db: Db;
  ch: Clickhouse;
  apiKey: string | undefined;
  fetch?: typeof fetch;
  /** Work that finishes after the response (looking up a speech call's cost). Tests pass one to await it. */
  later?: (work: Promise<void>) => void;
  /** How long to wait between cost lookups (speech/cost.ts); tests pass zeros. */
  costWaits?: readonly number[];
};

type Failure = {
  ok: false;
  code: "unavailable" | "not_found" | "bad_request" | "rate_limited" | "upstream_error";
  message: string;
};
export type RunResult = { ok: true; text: string; model: string; tokensIn: number; tokensOut: number } | Failure;
/** Receives each piece of text as it streams in. */
export type OnDelta = (text: string) => void | Promise<void>;

/** Everything needed to make and log one call, decided before any money is spent. */
export type Plan = { models: string[]; messages: ChatMessage[]; maxTokens: number; temperature: number; log: Omit<CallLog, "status" | "model"> };

export const fail = (code: Failure["code"], message: string): Failure => ({ ok: false, code, message });

/**
 * Runs a plan: checks limits, calls OpenRouter (streaming if `onDelta` is given) and logs
 * every outcome, refusals included, to ai_calls so limits and the dashboard see it.
 */
export async function execute(deps: RunDeps, plan: Plan, onDelta?: OnDelta): Promise<RunResult> {
  if (!deps.apiKey) return fail("unavailable", "The AI proxy isn't configured on this server.");
  const refusal = await checkLimits(deps, plan.log.gameId, plan.log.playerId);
  if (refusal) {
    await logCall(deps.ch, { ...plan.log, model: plan.models[0] ?? "", status: refusal.status });
    return fail("rate_limited", refusal.message);
  }
  const started = Date.now();
  const req = { apiKey: deps.apiKey, models: plan.models, messages: plan.messages, maxTokens: plan.maxTokens, temperature: plan.temperature, ...(deps.fetch ? { fetch: deps.fetch } : {}) };
  try {
    const result = onDelta ? await chatStream(req, onDelta) : await chat(req);
    await logCall(deps.ch, { ...plan.log, ...result, status: "ok", latencyMs: Date.now() - started });
    return { ok: true, text: result.text, model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
  } catch (err) {
    await logCall(deps.ch, { ...plan.log, model: plan.models[0] ?? "", status: "error", latencyMs: Date.now() - started });
    if (err instanceof UpstreamError) return fail("upstream_error", err.message);
    throw err;
  }
}

/**
 * Turns a game's request into a plan. Per-call options stay inside the template's bounds: the
 * model must be one the template lists, and max tokens can only go down.
 */
export async function planTemplate(db: Db, environmentId: string, req: AiRun): Promise<Plan | Failure> {
  const found = await loadTemplate(db, environmentId, req.template);
  if (!found) return fail("not_found", `No AI template named "${req.template}" for this game.`);
  const { template } = found;
  const rendered = renderTemplate(template.userTemplate, req.vars);
  if (!rendered.ok) return fail("bad_request", `Missing template variables: ${rendered.missing.join(", ")}`);
  const allowed = [template.model, ...template.fallbackModels];
  const chosen = req.options?.model ?? template.model;
  if (!allowed.includes(chosen)) return fail("bad_request", `Template "${template.name}" doesn't allow model ${chosen}. Allowed: ${allowed.join(", ")}`);
  const messages: ChatMessage[] = [
    ...(template.systemPrompt ? [{ role: "system" as const, content: template.systemPrompt }] : []),
    ...(req.messages ?? []),
    { role: "user", content: rendered.text },
  ];
  return {
    models: [chosen, ...allowed.filter((m) => m !== chosen)],
    messages,
    maxTokens: Math.min(req.options?.maxTokens ?? template.maxTokens, template.maxTokens),
    temperature: req.options?.temperature ?? template.temperature,
    log: { gameId: found.gameId, environmentId, template: template.name, templateVersion: template.version, playerId: req.playerId, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 },
  };
}

/** Runs a game's prompt template for one player. */
export async function runTemplate(deps: RunDeps, environmentId: string, req: AiRun, onDelta?: OnDelta): Promise<RunResult> {
  if (!deps.apiKey) return fail("unavailable", "The AI proxy isn't configured on this server.");
  const plan = await planTemplate(deps.db, environmentId, req);
  if ("ok" in plan) return plan;
  return execute(deps, plan, onDelta);
}

/**
 * A free-form call from a server key: any messages, any model. Logged as template "_direct" so
 * spend and limits still see it.
 */
export function planComplete(gameId: string, environmentId: string, req: AiComplete): Plan {
  return {
    models: [req.model, ...req.fallbackModels],
    messages: req.messages,
    maxTokens: req.maxTokens,
    temperature: req.temperature,
    log: { gameId, environmentId, template: "_direct", templateVersion: 0, playerId: req.playerId, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 },
  };
}
