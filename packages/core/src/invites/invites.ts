import { invites, memberships, orgs, users, type Db } from "@roost/db";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { normalizeEmail, randomToken, sha256 } from "../auth/index.ts";
import type { Role } from "../studio/index.ts";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const pending = () => and(isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()));

/**
 * Creates an invite and returns its raw token (for the email link, never stored). Inviting the
 * same email again replaces the old invite, so only the newest link works.
 */
export async function createInvite(db: Db, orgId: string, rawEmail: string, role: Role, invitedBy: string) {
  const email = normalizeEmail(rawEmail);
  const token = randomToken();
  const invite = await db.transaction(async (tx) => {
    await tx.delete(invites).where(and(eq(invites.orgId, orgId), eq(invites.email, email), isNull(invites.acceptedAt)));
    const [row] = await tx
      .insert(invites)
      .values({ orgId, email, role, tokenHash: sha256(token), invitedBy, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
      .returning({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt });
    return row;
  });
  if (!invite) throw new Error("invite insert returned no row");
  return { invite, token };
}

/** Is this email already a member? Inviting a member would only confuse them. */
export async function isMember(db: Db, orgId: string, rawEmail: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(users.email, normalizeEmail(rawEmail)), eq(memberships.orgId, orgId)))
    .limit(1);
  return !!row;
}

export function listInvites(db: Db, orgId: string) {
  return db
    .select({ id: invites.id, email: invites.email, role: invites.role, createdAt: invites.createdAt, expiresAt: invites.expiresAt })
    .from(invites)
    .where(and(eq(invites.orgId, orgId), pending()))
    .orderBy(asc(invites.email));
}

export async function revokeInvite(db: Db, orgId: string, inviteId: string): Promise<boolean> {
  return (await db.delete(invites).where(and(eq(invites.id, inviteId), eq(invites.orgId, orgId), isNull(invites.acceptedAt))).returning({ id: invites.id })).length > 0;
}

/** What the accept page shows: which studio, which role, and for which email. */
export async function previewInvite(db: Db, token: string) {
  const [row] = await db
    .select({ orgName: orgs.name, email: invites.email, role: invites.role })
    .from(invites)
    .innerJoin(orgs, eq(orgs.id, invites.orgId))
    .where(and(eq(invites.tokenHash, sha256(token)), pending()))
    .limit(1);
  return row ?? null;
}

export type AcceptResult = { ok: true; orgId: string } | { ok: false; reason: "invalid" | "wrong_email" };

/**
 * Joins the studio. The signed-in user's email must be the invited one, so a forwarded link
 * can't be used by someone else. Already being a member is fine (the role isn't changed).
 */
export async function acceptInvite(db: Db, token: string, user: { id: string; email: string }): Promise<AcceptResult> {
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(invites).where(and(eq(invites.tokenHash, sha256(token)), pending())).limit(1);
    if (!invite) return { ok: false, reason: "invalid" };
    if (invite.email !== normalizeEmail(user.email)) return { ok: false, reason: "wrong_email" };
    await tx.insert(memberships).values({ orgId: invite.orgId, userId: user.id, role: invite.role }).onConflictDoNothing();
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    return { ok: true, orgId: invite.orgId };
  });
}
