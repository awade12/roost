import { memberships, orgs, users, type Db } from "@roost/db";
import { and, asc, eq } from "drizzle-orm";
import type { Role } from "./access.ts";

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

export async function renameOrg(db: Db, orgId: string, name: string) {
  const [org] = await db.update(orgs).set({ name }).where(eq(orgs.id, orgId)).returning({ id: orgs.id, name: orgs.name });
  return org ?? null;
}

type MemberChange = { ok: true } | { ok: false; reason: "not_member" | "last_owner" };

/** Every studio keeps at least one owner, so the last one can't be demoted or removed. */
async function guardLastOwner(db: Db, orgId: string, userId: string): Promise<MemberChange> {
  const rows = await db.select({ userId: memberships.userId, role: memberships.role }).from(memberships).where(eq(memberships.orgId, orgId));
  const member = rows.find((r) => r.userId === userId);
  if (!member) return { ok: false, reason: "not_member" };
  const owners = rows.filter((r) => r.role === "owner").length;
  return member.role === "owner" && owners === 1 ? { ok: false, reason: "last_owner" } : { ok: true };
}

export async function setMemberRole(db: Db, orgId: string, userId: string, role: Role): Promise<MemberChange> {
  const check = await guardLastOwner(db, orgId, userId);
  if (!check.ok && !(check.reason === "last_owner" && role === "owner")) return check;
  await db.update(memberships).set({ role }).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  return { ok: true };
}

export async function removeMember(db: Db, orgId: string, userId: string): Promise<MemberChange> {
  const check = await guardLastOwner(db, orgId, userId);
  if (!check.ok) return check;
  await db.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  return { ok: true };
}
