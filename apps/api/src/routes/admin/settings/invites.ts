import { zValidator } from "@hono/zod-validator";
import { auth, invites } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { createLimiter } from "../../../http/rate-limit/index.ts";
import { invalid, OrgParam, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";
import { publicOrigin } from "../../shared/origin.ts";

const NewInvite = z.object({ email: z.email().max(254), role: z.enum(["owner", "dev", "viewer"]) });
const InviteParam = OrgParam.extend({ inviteId: z.uuid() });
const TokenParam = z.object({ token: z.string().min(16).max(128) });

/** Inviting people to a studio (owners) and accepting an invite (the invited person, signed in). */
export function inviteRoutes({ db, auth: authDeps, linear, rateLimits }: AppDeps) {
  // Invite emails per studio per hour: enough for a team, not for spamming.
  const inviteLimiter = createLimiter(rateLimits, { name: "invite", limit: 30, windowMs: 60 * 60_000 });
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/orgs/:orgId/invites", zValidator("param", OrgParam, invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      return c.json({ invites: await invites.listInvites(db, orgId) });
    })
    .post("/orgs/:orgId/invites", zValidator("param", OrgParam, invalid), zValidator("json", NewInvite, invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      const { email, role } = c.req.valid("json");
      if (await invites.isMember(db, orgId, email)) throw new AppError("conflict", "That person is already in the studio");
      await inviteLimiter.hit(orgId);
      const me = await auth.getMe(db, c.get("userId"));
      const studioName = me?.orgs.find((o) => o.id === orgId)?.name ?? "a studio";
      const { invite, token } = await invites.createInvite(db, orgId, email, role, c.get("userId"));
      // Sent inline, like sign-in codes: the raw token must never sit in the job table.
      // The dashboard's address: configured, else the page that sent this request (the browser's
      // Origin), else this server's own address (the same origin in production).
      const base = linear.dashboardUrl ?? c.req.header("origin") ?? publicOrigin(c);
      const link = `${base.replace(/\/$/, "")}/invite/${token}`;
      await authDeps.mailer.send(invites.inviteEmail(invite.email, studioName, role, link));
      return c.json(invite, 201);
    })
    .delete("/orgs/:orgId/invites/:inviteId", zValidator("param", InviteParam, invalid), async (c) => {
      const { orgId, inviteId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      if (!(await invites.revokeInvite(db, orgId, inviteId))) throw new AppError("not_found", "No such pending invite");
      return c.json({ ok: true as const });
    })
    .get("/invites/:token", zValidator("param", TokenParam, invalid), async (c) => {
      const preview = await invites.previewInvite(db, c.req.valid("param").token);
      if (!preview) throw new AppError("not_found", "This invite has expired, was revoked, or was already used");
      return c.json(preview);
    })
    .post("/invites/:token/accept", zValidator("param", TokenParam, invalid), async (c) => {
      const me = await auth.getMe(db, c.get("userId"));
      if (!me) throw new AppError("unauthorized", "Not signed in");
      const result = await invites.acceptInvite(db, c.req.valid("param").token, { id: me.id, email: me.email });
      if (!result.ok) {
        throw result.reason === "wrong_email"
          ? new AppError("forbidden", "This invite is for a different email. Sign in with the invited address.")
          : new AppError("not_found", "This invite has expired, was revoked, or was already used");
      }
      return c.json({ orgId: result.orgId });
    });
}
