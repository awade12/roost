import type { AiRunResponse, ErrorBody } from "../wire/index.ts";
import type { RoostOptions } from "../types.ts";

/** An AI proxy call failed. `code` is the API error code, e.g. "rate_limited". */
export class RoostAiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type AiVars = Record<string, string | number | boolean>;

export type AiOptions = {
  /** Earlier turns, so an NPC remembers the conversation. They go before the template's message. */
  messages?: { role: "user" | "assistant"; content: string }[];
  /** One of the template's models (its main model or a fallback). */
  model?: string;
  /** Up to the template's max tokens. */
  maxTokens?: number;
  temperature?: number;
};

const body = (opts: RoostOptions, template: string, vars: AiVars, o: AiOptions, stream: boolean) => {
  const options = { ...(o.model ? { model: o.model } : {}), ...(o.maxTokens ? { maxTokens: o.maxTokens } : {}), ...(o.temperature !== undefined ? { temperature: o.temperature } : {}) };
  return JSON.stringify({
    template,
    vars,
    playerId: opts.playerId,
    ...(o.messages?.length ? { messages: o.messages } : {}),
    ...(Object.keys(options).length ? { options } : {}),
    ...(stream ? { stream: true } : {}),
  });
};

async function post(opts: RoostOptions, payload: string): Promise<Response> {
  const res = await (opts.fetch ?? fetch)(`${opts.endpoint}/v1/ai/run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-roost-key": opts.clientKey },
    body: payload,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ErrorBody | null;
    throw new RoostAiError(err?.error.code ?? "internal", err?.error.message ?? `HTTP ${res.status}`);
  }
  return res;
}

export async function runAi(opts: RoostOptions, template: string, vars: AiVars, o: AiOptions): Promise<AiRunResponse> {
  return (await (await post(opts, body(opts, template, vars, o, false))).json()) as AiRunResponse;
}

/** Reads the proxy's Server-Sent Events: `delta` pieces, then `done` or `error`. */
export async function streamAi(opts: RoostOptions, template: string, vars: AiVars, o: AiOptions & { onDelta: (text: string) => void }): Promise<AiRunResponse> {
  const res = await post(opts, body(opts, template, vars, o, true));
  const reader = res.body?.getReader();
  if (!reader) throw new RoostAiError("internal", "No stream in the response");
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null") as Record<string, unknown> | null;
      if (event === "delta" && typeof data?.text === "string") {
        text += data.text;
        o.onDelta(data.text);
      } else if (event === "error") throw new RoostAiError(String(data?.code ?? "internal"), String(data?.message ?? "AI stream failed"));
      else if (event === "done") return { text, ...(data as Omit<AiRunResponse, "text">) };
    }
  }
  throw new RoostAiError("upstream_error", "The AI stream ended early");
}
