import { zValidator } from "@hono/zod-validator";
import { studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, OrgParam, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const MemberParam = OrgParam.extend({ userId: z.uuid() });
const Role = z.object({ role: z.enum(["owner", "dev", "viewer"]) });

const memberError = (reason: "not_member" | "last_owner") =>
  reason === "not_member" ? new AppError("not_found", "Not a member") : new AppError("conflict", "A studio needs at least one owner");

/** Studio name and members. Owners only, except that anyone may leave. */
export function studioSettingsRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .patch("/orgs/:orgId", zValidator("param", OrgParam, invalid), zValidator("json", z.object({ name: z.string().trim().min(1).max(80) }), invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      const org = await studio.renameOrg(db, orgId, c.req.valid("json").name);
      if (!org) throw new AppError("not_found", "Not found");
      return c.json(org);
    })
    .patch("/orgs/:orgId/members/:userId", zValidator("param", MemberParam, invalid), zValidator("json", Role, invalid), async (c) => {
      const { orgId, userId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      const result = await studio.setMemberRole(db, orgId, userId, c.req.valid("json").role);
      if (!result.ok) throw memberError(result.reason);
      return c.json({ ok: true as const });
    })
    .delete("/orgs/:orgId/members/:userId", zValidator("param", MemberParam, invalid), async (c) => {
      const { orgId, userId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, userId === c.get("userId") ? "viewer" : "owner");
      const result = await studio.removeMember(db, orgId, userId);
      if (!result.ok) throw memberError(result.reason);
      return c.json({ ok: true as const });
    });
}
