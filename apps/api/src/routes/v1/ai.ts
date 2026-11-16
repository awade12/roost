import { zValidator } from "@hono/zod-validator";
import { AiRunSchema, type AiRunResponse } from "@roost/contracts";
import { ai } from "@roost/core";
import { Hono } from "hono";
import type { AppDeps } from "../../app.ts";
import { requireKey, type KeyVars } from "../../http/client-key.ts";
import { limitBody, ONE_MB } from "../../http/body-limit.ts";
import { AppError } from "../../http/errors.ts";

export function aiRoutes({ db, ch, ai: aiDeps }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>().post(
    "/ai/run",
    limitBody(ONE_MB),
    requireKey(db),
    zValidator("json", AiRunSchema, (result) => {
      if (!result.success) throw new AppError("bad_request", "Invalid AI request");
    }),
    async (c) => {
      const result = await ai.runTemplate({ db, ch, ...aiDeps }, c.get("environmentId"), c.req.valid("json"));
      if (!result.ok) throw new AppError(result.code, result.message);
      const body: AiRunResponse = {
        text: result.text,
        model: result.model,
        usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut },
      };
      return c.json(body);
    },
  );
}
