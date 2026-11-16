import { zValidator } from "@hono/zod-validator";
import { alerts, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, OrgParam, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const ChannelParam = OrgParam.extend({ channelId: z.uuid() });
const NewChannel = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["discord", "slack", "webhook"]), name: z.string().trim().min(1).max(60), url: z.string().trim().max(500) }),
  z.object({ kind: z.literal("email"), name: z.string().trim().min(1).max(60), recipients: z.enum(["everyone", "owners"]) }),
]);

/** Where alerts go. Webhook URLs are secrets: owners add them, nobody reads them back. */
export function alertChannelRoutes({ db, auth, alerts: alertDeps, linear }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/orgs/:orgId/alert-channels", zValidator("param", OrgParam, invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "viewer");
      return c.json({ channels: await alerts.listChannels(db, auth.secret, orgId) });
    })
    .post("/orgs/:orgId/alert-channels", zValidator("param", OrgParam, invalid), zValidator("json", NewChannel, invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      const input = c.req.valid("json");
      if (input.kind !== "email" && !alerts.validWebhookUrl(input.kind, input.url)) {
        throw new AppError("bad_request", input.kind === "webhook" ? "Use an https:// URL" : `That isn't a ${input.kind} webhook URL`);
      }
      return c.json(await alerts.createChannel(db, auth.secret, orgId, input), 201);
    })
    .delete("/orgs/:orgId/alert-channels/:channelId", zValidator("param", ChannelParam, invalid), async (c) => {
      const { orgId, channelId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "owner");
      if (!(await alerts.deleteChannel(db, orgId, channelId))) throw new AppError("not_found", "Not found");
      return c.json({ ok: true as const });
    })
    // A quick, user-initiated call (like Linear), so it runs inline rather than in the worker.
    .post("/orgs/:orgId/alert-channels/:channelId/test", zValidator("param", ChannelParam, invalid), async (c) => {
      const { orgId, channelId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "dev");
      const [channel] = await alerts.loadChannels(db, auth.secret, orgId, [channelId]);
      if (!channel) throw new AppError("not_found", "Not found");
      // Tests go only to the person testing, never the whole studio.
      const me = (await studio.listMembers(db, orgId)).find((m) => m.id === c.get("userId"))?.email;
      const error = await alerts.deliver(channel, alerts.testMessage(channel.name, linear.dashboardUrl ?? null), {
        fetch: alertDeps?.fetch ?? fetch,
        mailer: auth.mailer,
        emails: () => Promise.resolve(me ? [me] : []),
      });
      if (error) throw new AppError("bad_request", `Test failed: ${error}`);
      return c.json({ ok: true as const });
    });
}
