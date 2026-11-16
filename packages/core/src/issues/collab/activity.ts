import { issueActivity, users, type Db } from "@roost/db";
import { and, asc, eq } from "drizzle-orm";

/** The issue's timeline: comments and changes, oldest first, with who did them. */
export function listActivity(db: Db, issueId: string) {
  return db
    .select({
      id: issueActivity.id,
      kind: issueActivity.kind,
      body: issueActivity.body,
      data: issueActivity.data,
      createdAt: issueActivity.createdAt,
      userId: issueActivity.userId,
      userEmail: users.email,
    })
    .from(issueActivity)
    .leftJoin(users, eq(users.id, issueActivity.userId))
    .where(eq(issueActivity.issueId, issueId))
    .orderBy(asc(issueActivity.createdAt))
    .limit(500);
}

export async function addComment(db: Db, issueId: string, userId: string, body: string) {
  const [row] = await db.insert(issueActivity).values({ issueId, userId, kind: "comment", body }).returning();
  return row;
}

/** People can only delete their own comments. Returns false if it wasn't theirs (or didn't exist). */
export async function deleteComment(db: Db, issueId: string, commentId: string, userId: string): Promise<boolean> {
  const deleted = await db
    .delete(issueActivity)
    .where(and(eq(issueActivity.id, commentId), eq(issueActivity.issueId, issueId), eq(issueActivity.userId, userId), eq(issueActivity.kind, "comment")))
    .returning({ id: issueActivity.id });
  return deleted.length > 0;
}
