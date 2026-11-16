import { sessions, type Db } from "@roost/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { randomToken, sha256 } from "./tokens.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A session dies 30 days after sign-in no matter what. */
export const SESSION_ABSOLUTE_MS = 30 * DAY_MS;
/** ...or after 7 days without use. */
export const SESSION_IDLE_MS = 7 * DAY_MS;
/** Write last_seen_at at most this often, not on every request. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export async function createSession(db: Db, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);
  await db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt };
}

/** Resolves a cookie token to a live session, or null if unknown, revoked, expired or idle. */
export async function findSession(db: Db, token: string) {
  const now = new Date();
  const [session] = await db
    .select({ id: sessions.id, userId: sessions.userId, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        gt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_IDLE_MS)),
      ),
    )
    .limit(1);
  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, session.id));
  }
  return { sessionId: session.id, userId: session.userId };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt)));
}
