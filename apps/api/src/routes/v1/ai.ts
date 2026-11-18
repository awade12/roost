import { zValidator } from "@hono/zod-validator";
import { AiCompleteSchema, AiDecideSchema, AiRunSchema, AiSpeakSchema, SPEAK_HEADERS, type AiDecideResponse, type AiRunResponse } from "@roost/contracts";
import { ai } from "@roost/core";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppDeps } from "../../app.ts";
import { limitBody, ONE_MB } from "../../http/body-limit.ts";
import { requireKey, requireServerKey, type KeyVars } from "../../http/client-key.ts";
import { AppError } from "../../http/errors.ts";

const invalid = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) => {
  if (!r.success) throw new AppError("bad_request", `Invalid AI request: ${r.error?.issues[0]?.path.join(".")} ${r.error?.issues[0]?.message}`);
};

/**
 * Plain calls answer with JSON. Streaming calls answer with Server-Sent Events: `delta` events
 * carry text as it arrives, then one `done` (model, usage) or `error` (code, message).
 */
function respond(c: Context, deps: ai.RunDeps, plan: ai.Plan, stream: boolean) {
  if (!stream) {
    return ai.execute(deps, plan).then((result) => {
      if (!result.ok) throw new AppError(result.code, result.message);
      const body: AiRunResponse = { text: result.text, model: result.model, usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut } };
      return c.json(body);
    });
  }
  return streamSSE(c, async (sse) => {
    const result = await ai.execute(deps, plan, (text) => sse.writeSSE({ event: "delta", data: JSON.stringify({ text }) }));
    if (result.ok) await sse.writeSSE({ event: "done", data: JSON.stringify({ model: result.model, usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut } }) });
    else await sse.writeSSE({ event: "error", data: JSON.stringify({ code: result.code, message: result.message }) });
  });
}

export function aiRoutes({ db, rateLimits, ch, ai: aiDeps }: AppDeps) {
  const deps = { db, ch, ...aiDeps };
  const configured = () => {
    if (!deps.apiKey) throw new AppError("unavailable", "The AI proxy isn't configured on this server.");
  };
  return new Hono<{ Variables: KeyVars }>()
    .post("/ai/run", limitBody(ONE_MB), requireKey({ db, rateLimits }), zValidator("json", AiRunSchema, invalid), async (c) => {
      configured();
      const req = c.req.valid("json");
      const plan = await ai.planTemplate(db, c.get("environmentId"), req);
      if ("ok" in plan) throw new AppError(plan.code, plan.message);
      return respond(c, deps, plan, req.stream ?? false);
    })
    .post("/ai/complete", limitBody(ONE_MB), requireKey({ db, rateLimits }), requireServerKey(), zValidator("json", AiCompleteSchema, invalid), async (c) => {
      configured();
      const req = c.req.valid("json");
      return respond(c, deps, ai.planComplete(c.get("gameId"), c.get("environmentId"), req), req.stream ?? false);
    })
    // Decision templates (OpenRouter's Decisions API): classify or score state. Client keys allowed.
    .post("/ai/decide", limitBody(ONE_MB), requireKey({ db, rateLimits }), zValidator("json", AiDecideSchema, invalid), async (c) => {
      const result = await ai.runDecision(deps, c.get("environmentId"), c.req.valid("json"));
      if (!result.ok) throw new AppError(result.code, result.message);
      const body: AiDecideResponse = { answers: result.answers, model: result.model, usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut } };
      return c.json(body);
    })
    // Speech templates (OpenRouter's text-to-speech). Client keys allowed. Answers with the audio bytes.
    .post("/ai/speak", limitBody(ONE_MB), requireKey({ db, rateLimits }), zValidator("json", AiSpeakSchema, invalid), async (c) => {
      const result = await ai.runSpeech(deps, c.get("environmentId"), c.req.valid("json"));
      if (!result.ok) throw new AppError(result.code, result.message);
      return c.body(result.audio, 200, { "content-type": result.contentType, [SPEAK_HEADERS.model]: result.model, [SPEAK_HEADERS.chars]: String(result.chars) });
    });
}
