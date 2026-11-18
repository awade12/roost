import type { AiSpeak } from "@roost/contracts";
import { checkLimits } from "../limits.ts";
import type { RunDeps } from "../run.ts";
import { UpstreamError } from "../upstream/openrouter.ts";
import { logCall, type CallLog } from "../usage.ts";
import { loadSpeech } from "./store.ts";
import { speak } from "./upstream.ts";

export type SpeechResult =
  | { ok: true; audio: ArrayBuffer; contentType: string; model: string; chars: number }
  | { ok: false; code: "unavailable" | "not_found" | "bad_request" | "rate_limited" | "upstream_error"; message: string };

/**
 * Says a line with a game's speech template for one player: same limits and logging as prompt
 * templates (logged under the template's name). The text's length counts as its input tokens, so
 * a player's daily budget covers speech too. OpenRouter reports no cost for speech, so cost is
 * logged as 0 and the monthly cap doesn't see speech spend.
 */
export async function runSpeech(deps: RunDeps, environmentId: string, req: AiSpeak): Promise<SpeechResult> {
  if (!deps.apiKey) return { ok: false, code: "unavailable", message: "The AI proxy isn't configured on this server." };
  const found = await loadSpeech(deps.db, environmentId, req.template);
  if (!found) return { ok: false, code: "not_found", message: `No AI speech template named "${req.template}" for this game.` };
  const { speech, gameId } = found;
  if (!speech.voices.includes(req.voice)) return { ok: false, code: "bad_request", message: `Speech template "${speech.name}" doesn't allow voice ${req.voice}. Allowed: ${speech.voices.join(", ")}` };
  if (req.text.length > speech.maxChars) return { ok: false, code: "bad_request", message: `Text is ${req.text.length} characters; speech template "${speech.name}" allows ${speech.maxChars}.` };
  const chars = req.text.length;
  const log: Omit<CallLog, "status"> = { gameId, environmentId, template: speech.name, templateVersion: speech.version, model: speech.model, playerId: req.playerId, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 };
  const refusal = await checkLimits(deps, gameId, req.playerId);
  if (refusal) {
    await logCall(deps.ch, { ...log, status: refusal.status });
    return { ok: false, code: "rate_limited", message: refusal.message };
  }
  const instructions = req.instructions ?? speech.instructions;
  const started = Date.now();
  try {
    const result = await speak({ apiKey: deps.apiKey, model: speech.model, input: req.text, voice: req.voice, format: speech.format, ...(instructions ? { instructions } : {}), ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    await logCall(deps.ch, { ...log, tokensIn: chars, status: "ok", latencyMs: Date.now() - started });
    return { ok: true, audio: result.audio, contentType: result.contentType, model: speech.model, chars };
  } catch (err) {
    await logCall(deps.ch, { ...log, status: "error", latencyMs: Date.now() - started });
    if (err instanceof UpstreamError) return { ok: false, code: "upstream_error", message: err.message };
    throw err;
  }
}
