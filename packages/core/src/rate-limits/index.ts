import { rateLimits, type Db } from "@roost/db";
import { lt } from "drizzle-orm";

/** Deletes rate-limit windows that have ended. Returns how many rows went. */
export async function pruneExpired(db: Db): Promise<number> {
  const gone = await db.delete(rateLimits).where(lt(rateLimits.expiresAt, new Date())).returning({ key: rateLimits.key });
  return gone.length;
}
