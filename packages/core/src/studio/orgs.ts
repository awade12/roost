import { memberships, orgs, users, type Db } from "@roost/db";
import { asc, eq } from "drizzle-orm";

/** Creates an org with the creator as its owner. */
export async function createOrg(db: Db, userId: string, name: string) {
  return db.transaction(async (tx) => {
    const [org] = await tx.insert(orgs).values({ name }).returning({ id: orgs.id, name: orgs.name });
    if (!org) throw new Error("org insert returned no row");
    await tx.insert(memberships).values({ orgId: org.id, userId, role: "owner" });
    return { ...org, role: "owner" as const };
  });
}

/** People in an org, for assignee pickers and member lists. */
export function listMembers(db: Db, orgId: string) {
  return db
    .select({ id: users.id, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(users.email));
}
