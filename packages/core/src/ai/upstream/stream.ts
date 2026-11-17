import { z } from "zod";
import { post, UpstreamError, type ChatRequest, type ChatResult } from "./openrouter.ts";

const ChunkSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }).optional() })).optional(),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number(), cost: z.number().optional() }).nullish(),
});

/**
 * Streams a completion: `onDelta` gets each piece of text as it arrives. OpenRouter sends
 * Server-Sent Events; the last chunk carries the billed usage. Resolves with the same totals
 * as `chat`, so the call is logged and counted against limits the same way.
 */
export async function chatStream(req: ChatRequest, onDelta: (text: string) => void | Promise<void>): Promise<ChatResult> {
  const res = await post(req, true);
  const reader = res.body?.getReader();
  if (!reader) throw new UpstreamError("OpenRouter returned no stream");
  const decoder = new TextDecoder();
  const result: ChatResult = { text: "", model: req.models[0] ?? "", tokensIn: 0, tokensOut: 0, costUsd: 0 };
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) await handleLine(line.trim(), result, onDelta);
  }
  return result;
}

async function handleLine(line: string, result: ChatResult, onDelta: (text: string) => void | Promise<void>) {
  // Comments (": OPENROUTER PROCESSING") keep the connection alive; [DONE] ends it.
  if (!line.startsWith("data:")) return;
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return;
  const chunk = ChunkSchema.safeParse(JSON.parse(payload));
  if (!chunk.success) return;
  if (chunk.data.model) result.model = chunk.data.model;
  const text = chunk.data.choices?.[0]?.delta?.content;
  if (text) {
    result.text += text;
    await onDelta(text);
  }
  if (chunk.data.usage) {
    result.tokensIn = chunk.data.usage.prompt_tokens;
    result.tokensOut = chunk.data.usage.completion_tokens;
    result.costUsd = chunk.data.usage.cost ?? 0;
  }
}
