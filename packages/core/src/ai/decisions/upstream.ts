import type { DecisionAnswer, DecisionQuestion } from "@roost/contracts";
import { z } from "zod";
import { UpstreamError } from "../upstream/openrouter.ts";

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

export type DecideRequest = {
  apiKey: string;
  model: string;
  state: string | Record<string, string | number | boolean>;
  questions: Record<string, DecisionQuestion>;
  timeoutMs?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
};

export type DecideResult = { answers: Record<string, DecisionAnswer>; model: string; tokensIn: number; tokensOut: number; costUsd: number };

const probabilities = z.record(z.string(), z.number()).catch({});

// Loose on purpose: the Decisions API is in alpha, so unknown fields are ignored and optional
// extras get defaults. Only what the game relies on is required.
const AnswerSchema = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("noul"), noul: z.number() }),
  z.looseObject({ type: z.literal("choice"), choice: z.string(), confidence: z.number(), probabilities }),
  z.looseObject({ type: z.literal("score"), score: z.number(), confidence: z.number(), probabilities, legend: z.record(z.string(), z.string()).catch({}) }),
]);

const ResponseSchema = z.looseObject({
  model: z.string().optional(),
  answers: z.record(z.string(), AnswerSchema),
  usage: z.looseObject({ input_tokens: z.number().optional(), output_tokens: z.number().optional(), cost: z.number().optional() }).optional(),
});

/** Keeps only the fields in our contract, so a new upstream field never leaks to games. */
function toAnswer(a: z.infer<typeof AnswerSchema>): DecisionAnswer {
  if (a.type === "noul") return { type: "noul", noul: a.noul };
  if (a.type === "choice") return { type: "choice", choice: a.choice, confidence: a.confidence, probabilities: a.probabilities };
  return { type: "score", score: a.score, confidence: a.confidence, probabilities: a.probabilities, legend: a.legend };
}

/** Parses a Decisions API response body. Throws UpstreamError if it isn't usable. */
export function parseDecision(body: unknown, requested: string): DecideResult {
  const parsed = ResponseSchema.safeParse(body);
  if (!parsed.success) throw new UpstreamError("OpenRouter returned an unexpected decision response");
  const { answers, usage, model } = parsed.data;
  return {
    answers: Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, toAnswer(a)])),
    model: model ?? requested,
    tokensIn: usage?.input_tokens ?? 0,
    tokensOut: usage?.output_tokens ?? 0,
    costUsd: usage?.cost ?? 0,
  };
}

/** One call to OpenRouter's Decisions API (alpha). Decision models don't work through chat completions. */
export async function decide(req: DecideRequest): Promise<DecideResult> {
  let res: Response;
  try {
    res = await (req.fetch ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${req.apiKey}`, "content-type": "application/json", "x-title": "Roost" },
      body: JSON.stringify({ model: req.model, state: req.state, questions: req.questions }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 15_000),
    });
  } catch (err) {
    throw new UpstreamError(err instanceof Error && err.name === "TimeoutError" ? "OpenRouter timed out" : "OpenRouter unreachable");
  }
  if (!res.ok) throw new UpstreamError(`OpenRouter returned HTTP ${res.status}`);
  return parseDecision(await res.json().catch(() => null), req.model);
}
