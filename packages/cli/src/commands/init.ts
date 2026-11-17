import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { ALL_FEATURES, buildSetup, type Features, type Platform } from "@roost/setup";
import { call, errorText, type Target } from "../api.ts";

const PLATFORMS: Platform[] = ["expo", "web", "rust"];

type Info = { game: string; environment: string };
type Current = { templates: Record<string, unknown>; flags: Record<string, { type: string }> };

/** "crashes,flags" → only those on; empty → everything. */
function parseFeatures(list: string | undefined): Features {
  if (!list) return ALL_FEATURES;
  const on = new Set(list.split(",").map((f) => f.trim()));
  return Object.fromEntries(Object.keys(ALL_FEATURES).map((k) => [k, on.has(k)])) as Features;
}

/**
 * Writes ROOST.md (instructions for a coding agent) and a starter roost.config.json, named after
 * the key's game and listing its real templates and flags. Never overwrites roost.config.json
 * unless --force: it may already hold the game's config.
 */
export async function init(t: Target, opts: { platform: string; features?: string | undefined; force: boolean }): Promise<number> {
  if (!PLATFORMS.includes(opts.platform as Platform)) {
    console.error(`--platform must be one of: ${PLATFORMS.join(", ")}`);
    return 2;
  }
  const [info, current] = await Promise.all([call<Info>(t, "GET", "/manage/info"), call<Current>(t, "GET", "/manage/config")]);
  if (info.status !== 200 || current.status !== 200) {
    console.error(`init failed: ${errorText(info.status !== 200 ? info.data : current.data)}`);
    return 1;
  }
  const files = buildSetup({
    game: info.data.game,
    environment: info.data.environment,
    endpoint: t.endpoint.replace(/\/$/, ""),
    clientKey: null,
    platform: opts.platform as Platform,
    features: parseFeatures(opts.features),
    templates: Object.keys(current.data.templates),
    flags: Object.entries(current.data.flags).map(([key, f]) => ({ key, type: f.type })),
  });
  for (const file of files) {
    if (file.name === "roost.config.json" && existsSync(file.name) && !opts.force) {
      console.log(`Kept your ${file.name} (use --force to replace it)`);
      continue;
    }
    await writeFile(file.name, file.content);
    console.log(`Wrote ${file.name}`);
  }
  console.log(`Next: give ROOST.md to your coding agent, or follow it yourself.`);
  return 0;
}
