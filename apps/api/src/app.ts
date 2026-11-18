import type { Clickhouse } from "@roost/clickhouse";
import type { storage } from "@roost/core";
import type { Db } from "@roost/db";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { AuthDeps } from "./auth-config.ts";
import { isValidKey } from "./http/client-key.ts";
import { errorResponse, onError } from "./http/errors.ts";
import { memoryRateStore, type RateStore } from "./http/rate-limit/index.ts";
import { adminRoutes } from "./routes/admin/index.ts";
import { healthRoutes } from "./routes/health.ts";
import { sdkRoutes } from "./routes/sdk.ts";
import { v1Routes } from "./routes/v1/index.ts";

/** Postgres for relational data, ClickHouse for events. */
/** `ai.fetch` is injected in tests so they never call OpenRouter. */
export type AppDeps = {
  db: Db;
  ch: Clickhouse;
  auth: AuthDeps;
  /** Attachment bytes (S3-compatible; in-memory in tests). */
  storage: storage.Storage;
  /** The AI proxy's key and, in tests, its upstream and a way to wait for work that runs after a response. */
  ai: { apiKey: string | undefined; fetch?: typeof fetch; later?: (work: Promise<void>) => void; costWaits?: readonly number[] };
  /** Linear API calls; `fetch` is injected in tests. `dashboardUrl` is linked from created Linear issues. */
  linear: { fetch?: typeof fetch; dashboardUrl: string | undefined };
  /** Test sends to alert channels; `fetch` is injected in tests. */
  alerts?: { fetch?: typeof fetch };
  /** Where `pnpm build:sdks` put the SDK packages, served under /sdk. */
  sdkDir?: string;
  /** Rate-limit counters: Postgres in production so replicas share them; in-memory in tests. */
  rateLimits: RateStore;
};

export function createApp(input: Omit<AppDeps, "rateLimits"> & { rateLimits?: RateStore }) {
  const deps: AppDeps = { ...input, rateLimits: input.rateLimits ?? memoryRateStore() };
  return new Hono()
    .use(requestId())
    .route("/", healthRoutes)
    .route("/v1", v1Routes(deps))
    .route("/admin", adminRoutes(deps))
    .route("/sdk", sdkRoutes(deps.sdkDir ?? "dist/sdk", (raw) => isValidKey(deps.db, raw)))
    .notFound((c) => errorResponse(c, "not_found", "No such route"))
    .onError(onError);
}
