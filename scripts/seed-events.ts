// Sends a realistic month of analytics events and some crash reports through the
// real ingest API, so the dashboard has data to show in development. Deterministic: same output each run.
//
//   node scripts/seed-events.ts <client-key> [--days 30] [--endpoint http://localhost:8787] [--crashes-only]
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    days: { type: "string", default: "30" },
    endpoint: { type: "string", default: "http://localhost:8787" },
    "crashes-only": { type: "boolean", default: false },
  },
});
const key = positionals[0];
if (!key?.startsWith("rk_client_")) {
  console.error("Usage: node scripts/seed-events.ts <rk_client_… key> [--days 30] [--endpoint URL]");
  process.exit(1);
}
const days = Number(values.days);

// Small seeded PRNG (mulberry32) so runs are repeatable.
let seed = 42;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Event = { id: string; name: string; ts: string; sessionId: string; playerId: string; props?: Record<string, number | string> };

/** One play session: start, a few levels, maybe the shop or the AI coach, end. */
function session(playerId: string, start: Date): Event[] {
  const sessionId = randomUUID();
  let t = start.getTime();
  const at = (name: string, props?: Event["props"]) => {
    t += 20_000 + rand() * 120_000;
    return { id: randomUUID(), name, ts: new Date(t).toISOString(), sessionId, playerId, ...(props ? { props } : {}) };
  };
  const events = [at("session_start")];
  const levels = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < levels; i++) {
    const level = 1 + Math.floor(rand() * 20);
    events.push(at("level_start", { level }));
    events.push(at(rand() < 0.8 ? "level_complete" : "level_fail", { level }));
  }
  if (rand() < 0.3) events.push(at("shop_open"));
  if (rand() < 0.2) events.push(at("ai_coach_chat"));
  events.push(at("session_end"));
  return events;
}

/** Players arrive daily (growing), then return with decaying probability. */
function simulate(): Event[] {
  const events: Event[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const players: { id: string; firstDay: number }[] = [];
  for (let day = 0; day < days; day++) {
    const newToday = Math.round(60 + day * 2 + rand() * 20 + (day % 7 >= 5 ? 25 : 0));
    for (let i = 0; i < newToday; i++) players.push({ id: `seed-${randomUUID().slice(0, 8)}`, firstDay: day });
    for (const p of players) {
      const age = day - p.firstDay;
      const returns = age === 0 || rand() < 0.42 / Math.sqrt(age || 1);
      if (!returns) continue;
      const start = new Date(today.getTime() - (days - 1 - day) * 86_400_000 + rand() * 80_000_000);
      if (start.getTime() < Date.now()) events.push(...session(p.id, start));
    }
  }
  return events;
}

async function send(batch: Event[]): Promise<void> {
  const res = await fetch(`${values.endpoint}/v1/events`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-roost-key": key ?? "" },
    body: JSON.stringify({ context: { build: "1.4.2", platform: rand() < 0.65 ? "ios" : "android", sdk: "seed" }, events: batch }),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after") ?? 5) * 1000));
    return send(batch);
  }
  if (!res.ok) throw new Error(`ingest failed: ${res.status} ${await res.text()}`);
}

/** A few realistic crash types, so the Issues page has something to show. */
const CRASH_KINDS = [
  { type: "TypeError", message: "Cannot read properties of undefined (reading 'inventory')", stack: "    at ShopScreen (index.bundle:4021:31)\n    at renderWithHooks (index.bundle:88:2)", before: ["session_start", "shop_open"], weight: 0.6 },
  { type: "panic", message: "index out of bounds: the len is 0 but the index is 0", stack: "    at game::pathfind::astar (pathfind.rs:88)\n    at game::ai::tick (ai.rs:211)", before: ["session_start", "level_start"], weight: 0.25 },
  { type: "OutOfMemoryError", message: "Failed to allocate 48MB texture atlas", stack: "    at TextureAtlas.load (atlas.ts:52:9)\n    at LevelLoader.start (loader.ts:17:3)", before: ["session_start", "level_start"], weight: 0.15 },
];

async function sendCrashes(count: number) {
  const crashes = Array.from({ length: count }, () => {
    const roll = rand();
    const kind = roll < 0.6 ? CRASH_KINDS[0] : roll < 0.85 ? CRASH_KINDS[1] : CRASH_KINDS[2];
    const at = Date.now() - rand() * (days - 1) * 86_400_000;
    return {
      id: randomUUID(),
      kind: "crash",
      type: kind?.type ?? "Error",
      message: kind?.message ?? "",
      stack: `${kind?.type}: ${kind?.message}\n${kind?.stack}`,
      ts: new Date(at).toISOString(),
      sessionId: randomUUID(),
      playerId: `seed-${Math.floor(rand() * 900)}`,
      breadcrumbs: (kind?.before ?? []).map((name, i, all) => ({ name, ts: new Date(at - (all.length - i) * 900).toISOString() })),
    };
  });
  for (let i = 0; i < crashes.length; i += 20) {
    const res = await fetch(`${values.endpoint}/v1/crashes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-roost-key": key ?? "" },
      body: JSON.stringify({ context: { build: "1.4.2", platform: rand() < 0.65 ? "ios" : "android", deviceModel: "iPhone 15", osVersion: "19.1", sdk: "seed" }, crashes: crashes.slice(i, i + 20) }),
    });
    if (!res.ok) throw new Error(`crash ingest failed: ${res.status} ${await res.text()}`);
  }
}

const events = values["crashes-only"] ? [] : simulate();
for (let i = 0; i < events.length; i += 500) {
  await send(events.slice(i, i + 500));
  process.stdout.write(`\rSent ${Math.min(i + 500, events.length)} / ${events.length} events`);
}
await sendCrashes(120);
console.log("\nSent 120 crash reports. Done.");
