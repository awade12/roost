import { alertChannels, type Db } from "@roost/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { open, seal } from "../integrations/index.ts";

export type ChannelKind = "discord" | "slack" | "webhook" | "email";
/** Email channels go to studio members: everyone, or owners only. */
export type EmailRecipients = "everyone" | "owners";

/** What the dashboard sees: never the webhook URL, only a hint to tell channels apart. */
export type ChannelView = { id: string; kind: ChannelKind; name: string; hint: string; createdAt: Date };

/** A channel ready to deliver to, with its URL decrypted. Server-side only. */
export type Channel = { id: string; kind: ChannelKind; name: string; url: string | null; recipients: EmailRecipients };

const HOSTS: Partial<Record<ChannelKind, RegExp>> = {
  discord: /^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\//,
  slack: /^https:\/\/hooks\.slack\.com\/services\//,
  webhook: /^https:\/\//,
};

/** Rejects URLs that aren't the provider's webhook endpoint, so a typo fails at save time, not at 3am. */
export function validWebhookUrl(kind: ChannelKind, url: string): boolean {
  const pattern = HOSTS[kind];
  return !!pattern && pattern.test(url) && url.length <= 500;
}

function hintFor(kind: ChannelKind, url: string | null, recipients: string | undefined): string {
  if (kind === "email") return recipients === "owners" ? "Studio owners" : "Everyone in the studio";
  if (!url) return "";
  const host = new URL(url).host;
  return `${host} …${url.slice(-4)}`;
}

export async function listChannels(db: Db, secret: string, orgId: string): Promise<ChannelView[]> {
  const rows = await db.select().from(alertChannels).where(eq(alertChannels.orgId, orgId)).orderBy(asc(alertChannels.createdAt));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    hint: hintFor(r.kind, r.secret ? open(secret, r.secret) : null, r.config.recipients),
    createdAt: r.createdAt,
  }));
}

export type NewChannel = { kind: ChannelKind; name: string; url?: string | undefined; recipients?: EmailRecipients | undefined };

export async function createChannel(db: Db, secret: string, orgId: string, input: NewChannel): Promise<ChannelView> {
  const sealed = input.kind === "email" || !input.url ? null : seal(secret, input.url);
  const config = input.kind === "email" ? { recipients: input.recipients ?? "everyone" } : {};
  const [row] = await db.insert(alertChannels).values({ orgId, kind: input.kind, name: input.name, secret: sealed, config }).returning();
  if (!row) throw new Error("channel insert returned no row");
  return { id: row.id, kind: row.kind, name: row.name, hint: hintFor(row.kind, input.url ?? null, config.recipients), createdAt: row.createdAt };
}

export async function deleteChannel(db: Db, orgId: string, channelId: string): Promise<boolean> {
  const done = await db
    .delete(alertChannels)
    .where(and(eq(alertChannels.id, channelId), eq(alertChannels.orgId, orgId)))
    .returning({ id: alertChannels.id });
  return done.length > 0;
}

/** Channels of one org, decrypted. Ids from other orgs are ignored, so a rule can't reach them. */
export async function loadChannels(db: Db, secret: string, orgId: string, ids?: string[]): Promise<Channel[]> {
  if (ids && ids.length === 0) return [];
  const where = ids ? and(eq(alertChannels.orgId, orgId), inArray(alertChannels.id, ids)) : eq(alertChannels.orgId, orgId);
  const rows = await db.select().from(alertChannels).where(where);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    url: r.secret ? open(secret, r.secret) : null,
    recipients: r.config.recipients === "owners" ? "owners" : "everyone",
  }));
}
