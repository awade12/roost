import { zValidator } from "@hono/zod-validator";
import { alerts, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const GameParam = z.object({ gameId: z.uuid() });
const RuleParam = z.object({ ruleId: z.uuid() });
const Rule = z.object({
  name: z.string().trim().min(1).max(80),
  environmentId: z.uuid(),
  trigger: z.enum(["new_issue", "regression", "spike"]),
  kinds: z.array(z.enum(["crash", "error", "message"])).min(1).max(3),
  threshold: z.number().int().min(1).max(1_000_000),
  windowMinutes: z.number().int().min(5).max(1440),
  cooldownMinutes: z.number().int().min(5).max(10_080),
  channelIds: z.array(z.uuid()).min(1).max(10),
  enabled: z.boolean(),
});

/** Alert rules per game. Devs manage them; anyone in the studio can see them and their history. */
export function alertRuleRoutes({ db }: AppDeps) {
  const forGame = async (userId: string, gameId: string, need: studio.Role) =>
    requireOrgRole(db, userId, await studio.orgOfGame(db, gameId), need);
  const forRule = async (userId: string, ruleId: string) => requireOrgRole(db, userId, await alerts.orgOfRule(db, ruleId), "dev");

  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/games/:gameId/alerts", zValidator("param", GameParam, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "viewer");
      const [rules, history] = await Promise.all([alerts.listRules(db, gameId), alerts.recentFirings(db, gameId)]);
      return c.json({ rules, history });
    })
    .post("/games/:gameId/alerts", zValidator("param", GameParam, invalid), zValidator("json", Rule, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "dev");
      const rule = await alerts.createRule(db, gameId, c.req.valid("json"), c.get("userId"));
      if (!rule) throw new AppError("bad_request", "That environment isn't part of this game");
      return c.json(rule, 201);
    })
    .put("/alerts/:ruleId", zValidator("param", RuleParam, invalid), zValidator("json", Rule, invalid), async (c) => {
      const { ruleId } = c.req.valid("param");
      await forRule(c.get("userId"), ruleId);
      const rule = await alerts.updateRule(db, ruleId, c.req.valid("json"));
      if (!rule) throw new AppError("bad_request", "That environment isn't part of this game");
      return c.json(rule);
    })
    .delete("/alerts/:ruleId", zValidator("param", RuleParam, invalid), async (c) => {
      const { ruleId } = c.req.valid("param");
      await forRule(c.get("userId"), ruleId);
      await alerts.deleteRule(db, ruleId);
      return c.json({ ok: true as const });
    });
}
