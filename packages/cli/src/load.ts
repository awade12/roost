import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RoostConfigSchema, type RoostConfig } from "@roost/contracts";

/**
 * Reads roost.config.json, or roost.config.ts exporting `config` (Node runs TypeScript
 * directly). Validated with the same schema the server uses, so mistakes show before a push.
 */
export async function loadConfig(file: string): Promise<RoostConfig> {
  const path = resolve(file);
  const raw: unknown = path.endsWith(".json")
    ? JSON.parse(await readFile(path, "utf8"))
    : ((await import(pathToFileURL(path).href)) as { config?: unknown; default?: unknown }).config;
  const parsed = RoostConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${file}: ${issue?.path.join(".") || "(root)"} ${issue?.message ?? "is invalid"}`);
  }
  return parsed.data;
}
