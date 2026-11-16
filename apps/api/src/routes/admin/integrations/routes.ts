import { zValidator } from "@hono/zod-validator";
import { integrations } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, OrgParam, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const ApiKey = z.string().trim().min(10).max(200);

/** Studio-level connections. Only owners change them; keys are encrypted and never returned. */
export function integrationRoutes({ db, auth, linear }: AppDeps) {
  const teams = async (apiKey: string) => {
    try {
      return await integrations.listTeams(apiKey, linear.fetch);
    } catch (err) {
      if (err instanceof integrations.LinearError) throw new AppError("bad_request", err.message);
      throw err;
    }
  };
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/orgs/:orgId/integrations", zValidator("param", OrgParam, invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "viewer");
      return c.json({ linear: await integrations.getLinear(db, orgId) });
    })
    // Step 1: check the key and list its teams, without saving anything.
    .post("/orgs/:orgId/integrations/linear/teams", zValidator("param", OrgParam, invalid), zValidator("json", z.object({ apiKey: ApiKey }), invalid), async (c) => {
      await requireOrgRole(db, c.get("userId"), c.req.valid("param").orgId, "owner");
      return c.json({ teams: await teams(c.req.valid("json").apiKey) });
    })
    // Step 2: save the key with the chosen team.
    .put("/orgs/:orgId/integrations/linear", zValidator("param", OrgParam, invalid), zValidator("json", z.object({ apiKey: ApiKey, teamId: z.string().min(1).max(64) }), invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      const { apiKey, teamId } = c.req.valid("json");
      const team = (await teams(apiKey)).find((t) => t.id === teamId);
      if (!team) throw new AppError("bad_request", "That team isn't available with this key");
      const config = { teamId: team.id, teamName: team.name, teamKey: team.key };
      await integrations.saveLinear(db, auth.secret, orgId, apiKey, config);
      return c.json(config);
    })
    .delete("/orgs/:orgId/integrations/linear", zValidator("param", OrgParam, invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      await integrations.removeLinear(db, orgId);
      return c.json({ ok: true as const });
    });
}
