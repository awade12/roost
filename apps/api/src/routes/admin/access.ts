import { issues, studio } from "@roost/core";
import type { Db } from "@roost/db";
import { z } from "zod";
import { AppError } from "../../http/errors.ts";

export const OrgParam = z.object({ orgId: z.uuid() });

export const invalid = (result: { success: boolean }) => {
  if (!result.success) throw new AppError("bad_request", "Invalid request");
};

/**
 * Throws unless the user has at least `need` in the org. Non-members get
 * not_found, not forbidden, so org IDs can't be probed.
 */
export async function requireOrgRole(db: Db, userId: string, orgId: string | null, need: studio.Role) {
  const role = orgId ? await studio.roleIn(db, userId, orgId) : null;
  if (!role) throw new AppError("not_found", "Not found");
  if (!studio.hasRole(role, need)) throw new AppError("forbidden", `Needs the ${need} role or higher`);
  return role;
}

/** Loads an issue the user may act on, with its org and game. Non-members get not_found. */
export async function forIssue(db: Db, userId: string, issueId: string, need: studio.Role) {
  const owner = await issues.ownerOfIssue(db, issueId);
  const role = await requireOrgRole(db, userId, owner?.orgId ?? null, need);
  const issue = await issues.getIssue(db, issueId);
  if (!issue || !owner) throw new AppError("not_found", "Not found");
  return { issue, role, ...owner };
}
