import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Clickhouse } from "../client.ts";

/** The package's own migrations folder. Bundled builds (the API image) pass their copy instead. */
const DEFAULT_MIGRATIONS_DIR = join(import.meta.dirname, "../../migrations");

/**
 * Applies `migrations/*.sql` in name order, once each. Files are append-only,
 * like the Postgres ones. Statements in a file are separated by `;` on its own line end.
 */
export async function runMigrations(ch: Clickhouse, dir: string = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  await ch.command({
    query: `CREATE TABLE IF NOT EXISTS schema_migrations
      (name String, applied_at DateTime64(3, 'UTC') DEFAULT now64(3))
      ENGINE = MergeTree ORDER BY name`,
  });
  const done = await ch.query({ query: "SELECT name FROM schema_migrations", format: "JSONEachRow" });
  const applied = new Set((await done.json<{ name: string }>()).map((r) => r.name));

  const pending = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !applied.has(f))
    .sort();
  for (const file of pending) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await ch.command({ query: statement });
    }
    await ch.insert({ table: "schema_migrations", values: [{ name: file }], format: "JSONEachRow" });
  }
  return pending;
}
