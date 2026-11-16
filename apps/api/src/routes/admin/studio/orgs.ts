import { zValidator } from "@hono/zod-validator";
import { studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";
import { invalid, OrgParam, requireOrgRole } from "../access.ts";

const CreateOrg = z.object({ name: z.string().trim().min(1).max(80) });

export function orgRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .post("/orgs", zValidator("json", CreateOrg, invalid), async (c) => {
      const org = await studio.createOrg(db, c.get("userId"), c.req.valid("json").name);
      return c.json(org, 201);
    })
    .get("/orgs/:orgId/members", zValidator("param", OrgParam, invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "viewer");
      return c.json({ members: await studio.listMembers(db, orgId) });
    });
}
