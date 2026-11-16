import { alertFirings, alertRules, environments, games, issues, type Db } from "@roost/db";
import { and, asc, desc, eq } from "drizzle-orm";

export type Trigger = "new_issue" | "regression" | "spike";
export type IssueKind = "crash" | "error" | "message";

export type RuleInput = {
  name: string;
  environmentId: string;
  trigger: Trigger;
  kinds: IssueKind[];
  threshold: number;
  windowMinutes: number;
  cooldownMinutes: number;
  channelIds: string[];
  enabled: boolean;
};

export type Rule = typeof alertRules.$inferSelect;

export function listRules(db: Db, gameId: string): Promise<Rule[]> {
  return db.select().from(alertRules).where(eq(alertRules.gameId, gameId)).orderBy(asc(alertRules.createdAt));
}

/** The environment must belong to the game, or the rule would watch another game's data. */
async function envInGame(db: Db, gameId: string, environmentId: string): Promise<boolean> {
  const [env] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(and(eq(environments.id, environmentId), eq(environments.gameId, gameId)))
    .limit(1);
  return !!env;
}

export async function createRule(db: Db, gameId: string, input: RuleInput, userId: string): Promise<Rule | null> {
  if (!(await envInGame(db, gameId, input.environmentId))) return null;
  const [rule] = await db.insert(alertRules).values({ ...input, gameId, createdBy: userId }).returning();
  return rule ?? null;
}

export async function updateRule(db: Db, ruleId: string, input: RuleInput): Promise<Rule | null> {
  const [current] = await db.select({ gameId: alertRules.gameId }).from(alertRules).where(eq(alertRules.id, ruleId)).limit(1);
  if (!current || !(await envInGame(db, current.gameId, input.environmentId))) return null;
  const [rule] = await db.update(alertRules).set(input).where(eq(alertRules.id, ruleId)).returning();
  return rule ?? null;
}

export async function deleteRule(db: Db, ruleId: string): Promise<void> {
  await db.delete(alertRules).where(eq(alertRules.id, ruleId));
}

/** For access checks: the org that owns a rule. */
export async function orgOfRule(db: Db, ruleId: string): Promise<string | null> {
  const [row] = await db
    .select({ orgId: games.orgId })
    .from(alertRules)
    .innerJoin(games, eq(games.id, alertRules.gameId))
    .where(eq(alertRules.id, ruleId))
    .limit(1);
  return row?.orgId ?? null;
}

/** Latest alerts sent for a game, for the history list. */
export function recentFirings(db: Db, gameId: string, limit = 20) {
  return db
    .select({
      id: alertFirings.id,
      firedAt: alertFirings.firedAt,
      delivered: alertFirings.delivered,
      error: alertFirings.error,
      ruleName: alertRules.name,
      trigger: alertRules.trigger,
      issueId: issues.id,
      issueNumber: issues.number,
      issueType: issues.type,
      issueMessage: issues.message,
    })
    .from(alertFirings)
    .innerJoin(alertRules, eq(alertRules.id, alertFirings.ruleId))
    .innerJoin(issues, eq(issues.id, alertFirings.issueId))
    .where(eq(alertRules.gameId, gameId))
    .orderBy(desc(alertFirings.firedAt))
    .limit(limit);
}
