#!/usr/bin/env node
/**
 * roost — keep a game's AI templates, flags and AI limits in its repo.
 *
 *   roost init --platform expo|web|rust [--features crashes,flags,…] [--force]
 *                                                  ROOST.md (agent instructions) + roost.config.json
 *   roost pull [--out roost.config.json]           current config → file
 *   roost push [--file roost.config.json] [--dry-run] [--prune]
 *
 * Needs a server key for the environment (flags are per environment, templates per game):
 * ROOST_ENDPOINT and ROOST_KEY, or --endpoint and --key.
 */
import { parseArgs } from "node:util";
import { init } from "./commands/init.ts";
import { pull } from "./commands/pull.ts";
import { push } from "./commands/push.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    endpoint: { type: "string" },
    key: { type: "string" },
    file: { type: "string", default: "roost.config.json" },
    out: { type: "string", default: "roost.config.json" },
    "dry-run": { type: "boolean", default: false },
    prune: { type: "boolean", default: false },
    platform: { type: "string" },
    features: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

const target = { endpoint: values.endpoint ?? process.env.ROOST_ENDPOINT ?? "", key: values.key ?? process.env.ROOST_KEY ?? "" };
const command = positionals[0];

async function main(): Promise<number> {
  if (command !== "push" && command !== "pull" && command !== "init") {
    console.error("usage: roost <init|push|pull> [--platform expo|web|rust] [--file f] [--out f] [--dry-run] [--prune] [--endpoint url] [--key rk_server_…]");
    return 2;
  }
  if (!target.endpoint || !target.key.startsWith("rk_server_")) {
    console.error("Set ROOST_ENDPOINT and ROOST_KEY (a server key, rk_server_…), or pass --endpoint and --key.");
    return 2;
  }
  if (command === "init") return init(target, { platform: values.platform ?? "", features: values.features, force: values.force });
  return command === "push" ? push(target, { file: values.file, prune: values.prune, dryRun: values["dry-run"] }) : pull(target, { out: values.out });
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
