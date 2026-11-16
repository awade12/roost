import { ClickhouseEnvSchema, createClickhouse } from "../client.ts";
import { runMigrations } from "./run.ts";

const ch = createClickhouse(ClickhouseEnvSchema.parse(process.env));
try {
  const applied = await runMigrations(ch);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "ClickHouse is up to date.");
} finally {
  await ch.close();
}
