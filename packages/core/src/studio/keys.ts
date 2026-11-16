import { apiKeys, type Db } from "@roost/db";
import { and, eq, isNull } from "drizzle-orm";
import { randomToken, sha256 } from "../auth/index.ts";

export type KeyKind = "client" | "server";

// The prefix makes a leaked key recognisable (secret scanners, log reviews) and
// tells people at a glance which kind it is.
const PREFIX: Record<KeyKind, string> = { client: "rk_client_", server: "rk_server_" };

/**
 * Creates a key for an environment. The raw key is returned exactly once;
 * only its SHA-256 and a short display prefix are stored.
 */
export async function createKey(db: Db, environmentId: string, kind: KeyKind) {
  const raw = `${PREFIX[kind]}${randomToken()}`;
  const [key] = await db
    .insert(apiKeys)
    .values({ environmentId, kind, prefix: raw.slice(0, PREFIX[kind].length + 6), hash: sha256(raw) })
    .returning({ id: apiKeys.id, kind: apiKeys.kind, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt });
  if (!key) throw new Error("key insert returned no row");
  return { ...key, raw };
}

/** Revokes a key immediately. Returns false if it was already revoked. */
export async function revokeKey(db: Db, keyId: string): Promise<boolean> {
  const rows = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}
