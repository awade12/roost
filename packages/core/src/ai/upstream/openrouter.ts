import { z } from "zod";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatRequest = {
  apiKey: string;
  /** Main model first, then fallbacks. OpenRouter tries them in order. */
  models: string[];
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
};

export type ChatResult = { text: string; model: string; tokensIn: number; tokensOut: number; costUsd: number };

/** OpenRouter failed or answered with something unusable. Message is safe to log. */
export class UpstreamError extends Error {}

const ResponseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z
    .object({ prompt_tokens: z.number(), completion_tokens: z.number(), cost: z.number().optional() })
    .optional(),
});

/** Sends the request to OpenRouter; shared by plain and streaming calls. */
export async function post(req: ChatRequest, stream: boolean): Promise<Response> {
  let res: Response;
  try {
    res = await (req.fetch ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${req.apiKey}`, "content-type": "application/json", "x-title": "Roost" },
      body: JSON.stringify({
        model: req.models[0],
        ...(req.models.length > 1 ? { models: req.models } : {}),
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        stream,
        // Asks OpenRouter to include the real cost, so spend caps use billed numbers.
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? (stream ? 120_000 : 30_000)),
    });
  } catch (err) {
    throw new UpstreamError(err instanceof Error && err.name === "TimeoutError" ? "OpenRouter timed out" : "OpenRouter unreachable");
  }
  if (!res.ok) throw new UpstreamError(`OpenRouter returned HTTP ${res.status}`);
  return res;
}

export async function chat(req: ChatRequest): Promise<ChatResult> {
  const res = await post(req, false);
  const parsed = ResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new UpstreamError("OpenRouter returned an unexpected response");
  const { model, choices, usage } = parsed.data;
  return {
    text: choices[0]?.message.content ?? "",
    model,
    tokensIn: usage?.prompt_tokens ?? 0,
    tokensOut: usage?.completion_tokens ?? 0,
    costUsd: usage?.cost ?? 0,
  };
}
