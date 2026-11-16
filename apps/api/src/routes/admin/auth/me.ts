import { auth } from "@roost/core";
import { Hono } from "hono";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { requireSession, type SessionVars } from "./session.ts";

export function meRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>().get("/me", requireSession(db), async (c) => {
    const me = await auth.getMe(db, c.get("userId"));
    if (!me) throw new AppError("unauthorized", "Not signed in");
    return c.json(me);
  });
}
