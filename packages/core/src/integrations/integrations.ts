import { integrations, type Db } from "@roost/db";
import { and, eq } from "drizzle-orm";
import { open, seal } from "./crypto.ts";

export type LinearConfig = { teamId: string; teamName: string; teamKey: string };

/** Public view of the org's Linear connection (never includes the key). */
export async function getLinear(db: Db, orgId: string): Promise<LinearConfig | null> {
  const [row] = await db
    .select({ config: integrations.config })
    .from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.kind, "linear")))
    .limit(1);
  return (row?.config as LinearConfig | undefined) ?? null;
}

/** The decrypted key, for server-side calls only. */
export async function linearKey(db: Db, secret: string, orgId: string): Promise<{ apiKey: string; config: LinearConfig } | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.kind, "linear")))
    .limit(1);
  return row ? { apiKey: open(secret, row.secret), config: row.config as LinearConfig } : null;
}

export async function saveLinear(db: Db, secret: string, orgId: string, apiKey: string, config: LinearConfig) {
  const sealed = seal(secret, apiKey);
  await db
    .insert(integrations)
    .values({ orgId, kind: "linear", secret: sealed, config })
    .onConflictDoUpdate({ target: [integrations.orgId, integrations.kind], set: { secret: sealed, config } });
}

export async function removeLinear(db: Db, orgId: string) {
  await db.delete(integrations).where(and(eq(integrations.orgId, orgId), eq(integrations.kind, "linear")));
}
