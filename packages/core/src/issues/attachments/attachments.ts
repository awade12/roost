import { attachments, environments, games, type Db } from "@roost/db";
import { asc, eq } from "drizzle-orm";
import type { Storage } from "../../storage/index.ts";

type NewAttachment = { id: string; environmentId: string; crashId: string; name: string; contentType: string; bytes: Uint8Array };

/** Stores the bytes and the metadata. Uploading the same id twice keeps the first (retries are safe). */
export async function saveAttachment(db: Db, storage: Storage, a: NewAttachment) {
  const storageKey = `env/${a.environmentId}/crash/${a.crashId}/${a.id}`;
  await storage.put(storageKey, a.bytes, a.contentType);
  await db
    .insert(attachments)
    .values({ id: a.id, environmentId: a.environmentId, crashId: a.crashId, name: a.name, contentType: a.contentType, size: a.bytes.byteLength, storageKey })
    .onConflictDoNothing();
}

export function listAttachments(db: Db, crashId: string) {
  return db
    .select({ id: attachments.id, name: attachments.name, contentType: attachments.contentType, size: attachments.size })
    .from(attachments)
    .where(eq(attachments.crashId, crashId))
    .orderBy(asc(attachments.name));
}

/** Metadata + bytes for a download, plus the owning org for authorization. */
export async function getAttachment(db: Db, storage: Storage, id: string) {
  const [row] = await db
    .select({ attachment: attachments, orgId: games.orgId })
    .from(attachments)
    .innerJoin(environments, eq(environments.id, attachments.environmentId))
    .innerJoin(games, eq(games.id, environments.gameId))
    .where(eq(attachments.id, id))
    .limit(1);
  if (!row) return null;
  const file = await storage.get(row.attachment.storageKey);
  return file ? { ...row.attachment, orgId: row.orgId, body: file.body } : null;
}
