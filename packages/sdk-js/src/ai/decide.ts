import type { AiDecideResponse } from "../wire/index.ts";
import type { RoostOptions } from "../types.ts";
import { post } from "./call.ts";

/** What a decision reads: free text, or named fields such as `{ message, to }`. */
export type DecisionState = string | Record<string, string | number | boolean>;

export async function runDecision(opts: RoostOptions, decision: string, state: DecisionState): Promise<AiDecideResponse> {
  const res = await post(opts, JSON.stringify({ decision, state, playerId: opts.playerId }), "/v1/ai/decide");
  return (await res.json()) as AiDecideResponse;
}
