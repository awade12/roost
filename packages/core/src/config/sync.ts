import type { RoostConfig } from "@roost/contracts";
import type { Db } from "@roost/db";
import { deleteTemplateByName, getLimits, listTemplates, saveLimits, upsertTemplate } from "../ai/index.ts";
import { flagValuesMatch, sameJson } from "./evaluate.ts";
import { deleteFlagByKey, listFlags, upsertFlag } from "./flags.ts";

export type SyncChange = { kind: "template" | "flag" | "aiLimits"; name: string; result: "created" | "updated" | "unchanged" | "deleted" | "error"; error?: string };

/** The game's templates and this environment's flags, in config-file shape (what `roost pull` writes). */
export async function exportConfig(db: Db, gameId: string, environmentId: string): Promise<RoostConfig> {
  const [templates, flags, aiLimits] = await Promise.all([listTemplates(db, gameId), listFlags(db, environmentId), getLimits(db, gameId)]);
  return {
    templates: Object.fromEntries(templates.map((t) => [t.name, { model: t.model, fallbackModels: t.fallbackModels, systemPrompt: t.systemPrompt, userTemplate: t.userTemplate, maxTokens: t.maxTokens, temperature: t.temperature }])),
    flags: Object.fromEntries(flags.map((f) => [f.key, { type: f.type, description: f.description, value: f.value, rollout: f.rollout ?? null, overrides: f.overrides }])),
    aiLimits,
  };
}

type Target = { db: Db; gameId: string; environmentId: string; prune: boolean; dryRun: boolean };

/**
 * Applies a config file: upserts every template and flag in it and, with `prune`, deletes ones
 * that aren't. With `dryRun` nothing is written; the result says what would change.
 */
export async function applyConfig(t: Target, file: RoostConfig): Promise<SyncChange[]> {
  const current = await exportConfig(t.db, t.gameId, t.environmentId);
  const changes: SyncChange[] = [];
  for (const [name, body] of Object.entries(file.templates)) {
    const existing = current.templates[name];
    const result = !existing ? "created" : sameJson(existing, body) ? "unchanged" : "updated";
    if (!t.dryRun && result !== "unchanged") await upsertTemplate(t.db, t.gameId, { name, ...body });
    changes.push({ kind: "template", name, result });
  }
  for (const [key, body] of Object.entries(file.flags)) {
    const existing = current.flags[key];
    if (!flagValuesMatch(body.type, body)) {
      changes.push({ kind: "flag", name: key, result: "error", error: `every value must be a ${body.type}` });
      continue;
    }
    if (existing && existing.type !== body.type) {
      changes.push({ kind: "flag", name: key, result: "error", error: `is a ${existing.type} flag; delete it to change the type` });
      continue;
    }
    const result = !existing ? "created" : sameJson(existing, { type: body.type, description: body.description, value: body.value, rollout: body.rollout, overrides: body.overrides }) ? "unchanged" : "updated";
    if (!t.dryRun && result !== "unchanged") await upsertFlag(t.db, t.environmentId, key, body, null);
    changes.push({ kind: "flag", name: key, result });
  }
  if (file.aiLimits) {
    const same = sameJson(current.aiLimits, file.aiLimits);
    if (!t.dryRun && !same) await saveLimits(t.db, t.gameId, file.aiLimits);
    changes.push({ kind: "aiLimits", name: "aiLimits", result: same ? "unchanged" : "updated" });
  }
  if (t.prune) changes.push(...(await prune(t, current, file)));
  return changes;
}

async function prune(t: Target, current: RoostConfig, file: RoostConfig): Promise<SyncChange[]> {
  const out: SyncChange[] = [];
  for (const name of Object.keys(current.templates).filter((n) => !(n in file.templates))) {
    if (!t.dryRun) await deleteTemplateByName(t.db, t.gameId, name);
    out.push({ kind: "template", name, result: "deleted" });
  }
  for (const key of Object.keys(current.flags).filter((k) => !(k in file.flags))) {
    if (!t.dryRun) await deleteFlagByKey(t.db, t.environmentId, key);
    out.push({ kind: "flag", name: key, result: "deleted" });
  }
  return out;
}
