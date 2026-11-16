import { memberships, orgs, users, type Db } from "@roost/db";
import { eq } from "drizzle-orm";

export async function findUserByEmail(db: Db, email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

/** Returns the user for this email, creating it on first sign-in. */
export async function upsertUser(db: Db, email: string) {
  await db.insert(users).values({ email }).onConflictDoNothing();
  const user = await findUserByEmail(db, email);
  if (!user) throw new Error("user missing right after upsert");
  return user;
}

export type Me = {
  id: string;
  email: string;
  orgs: { id: string; name: string; role: "owner" | "dev" | "viewer" }[];
};

/** The signed-in user and the orgs they belong to. */
export async function getMe(db: Db, userId: string): Promise<Me | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const rows = await db
    .select({ id: orgs.id, name: orgs.name, role: memberships.role })
    .from(memberships)
    .innerJoin(orgs, eq(orgs.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(orgs.name);
  return { id: user.id, email: user.email, orgs: rows };
}
