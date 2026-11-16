import { PgBoss } from "pg-boss";
import { loadEnv } from "./env.ts";
import { registerJobs } from "./jobs/index.ts";

const env = loadEnv();
const boss = new PgBoss(env.DATABASE_URL);
boss.on("error", (err) => console.error(JSON.stringify({ msg: "pg-boss error", err: String(err) })));

await boss.start();
await registerJobs(boss);
console.log(JSON.stringify({ msg: "roost worker started" }));

async function shutdown() {
  await boss.stop();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
